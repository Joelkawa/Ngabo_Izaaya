from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_, func, desc, asc
from typing import List, Optional, Tuple, Dict, Any
from fastapi import HTTPException, status, UploadFile
from datetime import datetime, timedelta
import os
import re
import shutil
import uuid

from apps.posts.models import Post, Comment, Like, CommentLike, Tag, PostTag
from apps.posts.schemas import (
    PostCreate,
    PostUpdate,
    CommentCreate,
    CommentUpdate,
    TagCreate,
    PostFilter,
    PostType,
    PostVisibility,
)
from apps.auth.models import UserModel

ALLOWED_POST_MEDIA_TYPES = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".webp",
    ".mp4",
    ".mov",
    ".avi",
    ".wmv",
    ".flv",
    ".webm",
    ".m4v",
}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".wmv", ".flv", ".webm", ".m4v"}
MAX_POST_MEDIA_SIZE = 100 * 1024 * 1024
MAX_POST_MEDIA_FILES = 10


def is_admin_user(user: Optional[UserModel]) -> bool:
    return bool(user and user.role and user.role.name == "admin")


def build_post_title(title: Optional[str], content: Optional[str], author_id: int) -> str:
    cleaned_title = (title or "").strip()
    if cleaned_title:
        return cleaned_title

    cleaned_content = (content or "").strip()
    if cleaned_content:
        compact = " ".join(cleaned_content.split())
        return compact[:77] + "..." if len(compact) > 80 else compact

    return f"Association post by member {author_id}"


def infer_post_type(media_urls: List[str], content: Optional[str]) -> PostType:
    has_content = bool(content and content.strip())
    if not media_urls:
        return PostType.TEXT

    extensions = {
        os.path.splitext(url.split("?")[0])[1].lower()
        for url in media_urls
    }
    has_images = any(ext in IMAGE_EXTENSIONS for ext in extensions)
    has_videos = any(ext in VIDEO_EXTENSIONS for ext in extensions)

    if has_content or (has_images and has_videos):
        return PostType.MIXED
    if has_videos:
        return PostType.VIDEO
    return PostType.IMAGE


def save_post_media_files(files: List[UploadFile]) -> List[str]:
    if len(files) > MAX_POST_MEDIA_FILES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum {MAX_POST_MEDIA_FILES} media files allowed per post",
        )

    upload_dir = "uploads/post_media"
    os.makedirs(upload_dir, exist_ok=True)

    saved_files: List[str] = []

    try:
        for file in files:
            if not file or not file.filename:
                continue

            file.file.seek(0, 2)
            file_size = file.file.tell()
            file.file.seek(0)

            if file_size > MAX_POST_MEDIA_SIZE:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"{file.filename} is too large. Maximum allowed size is {MAX_POST_MEDIA_SIZE // (1024 * 1024)}MB",
                )

            file_extension = os.path.splitext(file.filename)[1].lower()
            if file_extension not in ALLOWED_POST_MEDIA_TYPES:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"{file.filename} is not a supported image or video type",
                )

            unique_filename = f"{uuid.uuid4()}{file_extension}"
            file_path = os.path.join(upload_dir, unique_filename)

            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            saved_files.append(f"/uploads/post_media/{unique_filename}")

        return saved_files
    except Exception:
        for saved_url in saved_files:
            absolute_path = saved_url.lstrip("/")
            if os.path.exists(absolute_path):
                os.remove(absolute_path)
        raise

# Tag Services
def create_tag(db: Session, tag_data: TagCreate) -> Tag:
    """
    Create a new tag
    """
    # Generate slug from name
    slug = re.sub(r'[^a-z0-9]+', '-', tag_data.name.lower()).strip('-')
    
    # Check if tag already exists
    existing_tag = db.query(Tag).filter(
        or_(
            Tag.name == tag_data.name,
            Tag.slug == slug
        )
    ).first()
    
    if existing_tag:
        return existing_tag
    
    db_tag = Tag(
        name=tag_data.name,
        slug=slug,
        description=tag_data.description
    )
    
    db.add(db_tag)
    db.commit()
    db.refresh(db_tag)
    return db_tag

def get_or_create_tags(db: Session, tag_names: List[str]) -> List[Tag]:
    """
    Get existing tags or create new ones
    """
    tags = []
    for tag_name in tag_names:
        if not tag_name.strip():
            continue
            
        slug = re.sub(r'[^a-z0-9]+', '-', tag_name.lower()).strip('-')
        
        # Check if tag exists
        tag = db.query(Tag).filter(
            or_(
                Tag.name == tag_name.strip(),
                Tag.slug == slug
            )
        ).first()
        
        if not tag:
            tag = Tag(
                name=tag_name.strip(),
                slug=slug,
                description=None
            )
            db.add(tag)
            db.flush()
        
        tags.append(tag)
    
    db.commit()
    return tags

# Post Services
def create_post(
    db: Session, 
    post_data: PostCreate, 
    author_id: int
) -> Post:
    """
    Create a new post
    """
    try:
        # Create tags if provided
        tags = []
        if post_data.tags:
            tags = get_or_create_tags(db, post_data.tags)
        
        normalized_media_urls = [url for url in (post_data.media_urls or []) if url]

        # Create post
        db_post = Post(
            title=build_post_title(post_data.title, post_data.content, author_id),
            content=post_data.content,
            post_type=post_data.post_type,
            media_urls=normalized_media_urls,
            visibility=PostVisibility.PUBLIC,
            author_id=author_id,
            published_at=datetime.utcnow()
        )
        
        db.add(db_post)
        db.flush()  # Get ID without committing
        
        # Associate tags with post
        for tag in tags:
            post_tag = PostTag(post_id=db_post.id, tag_id=tag.id)
            db.add(post_tag)
        
        db.commit()
        db.refresh(db_post)
        
        # Eager load relationships
        db_post = get_post_with_relationships(db, db_post.id)
        
        return db_post
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating post: {str(e)}"
        )

def get_post_with_relationships(db: Session, post_id: int) -> Optional[Post]:
    """
    Get post with all relationships loaded
    """
    return db.query(Post).\
        options(
            joinedload(Post.author),
            joinedload(Post.likes),
            joinedload(Post.post_tags).joinedload(PostTag.tag),
            joinedload(Post.comments).joinedload(Comment.author),
            joinedload(Post.comments).joinedload(Comment.likes),
            joinedload(Post.comments).joinedload(Comment.replies),
        ).\
        filter(Post.id == post_id).\
        first()

def get_post(db: Session, post_id: int, include_deleted: bool = False) -> Optional[Post]:
    """
    Get a specific post by ID
    """
    query = db.query(Post).filter(Post.id == post_id)
    
    if not include_deleted:
        query = query.filter(Post.is_archived == False)
    
    return query.first()

def update_post(
    db: Session, 
    post_id: int, 
    post_data: PostUpdate,
    user_id: int
) -> Post:
    """
    Update an existing post
    """
    db_post = get_post(db, post_id)
    if not db_post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found"
        )
    
    # Check if user is the author or admin
    if db_post.author_id != user_id:
        # Check if user is admin
        user = db.query(UserModel).filter(UserModel.id == user_id).first()
        if not is_admin_user(user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only update your own posts"
            )
    
    try:
        update_data = post_data.model_dump(exclude_unset=True)
        
        # Handle tags separately
        tags = update_data.pop('tags', None)

        if "title" in update_data or "content" in update_data:
            update_data["title"] = build_post_title(
                update_data.get("title", db_post.title),
                update_data.get("content", db_post.content),
                db_post.author_id,
            )

        for field, value in update_data.items():
            if value is not None:
                setattr(db_post, field, value)

        db_post.visibility = PostVisibility.PUBLIC
        
        # Update tags if provided
        if tags is not None:
            # Remove existing tags
            db.query(PostTag).filter(PostTag.post_id == post_id).delete()
            
            # Add new tags
            tag_objects = get_or_create_tags(db, tags)
            for tag in tag_objects:
                post_tag = PostTag(post_id=post_id, tag_id=tag.id)
                db.add(post_tag)
        
        db_post.updated_at = datetime.utcnow()
        
        db.commit()
        db.refresh(db_post)
        
        # Reload with relationships
        db_post = get_post_with_relationships(db, post_id)
        
        return db_post
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating post: {str(e)}"
        )

def delete_post(db: Session, post_id: int, user_id: int) -> dict:
    """
    Soft delete a post (archive it)
    """
    db_post = get_post(db, post_id)
    if not db_post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found"
        )
    
    # Check if user is the author or admin
    if db_post.author_id != user_id:
        user = db.query(UserModel).filter(UserModel.id == user_id).first()
        if not is_admin_user(user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only delete your own posts"
            )
    
    try:
        db_post.is_archived = True
        db.commit()
        
        return {"message": "Post archived successfully"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting post: {str(e)}"
        )

def get_posts_with_filters(
    db: Session,
    filters: PostFilter,
    user_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 20
) -> Tuple[List[Post], int]:
    """
    Get posts with advanced filtering
    """
    # Start with base query
    query = db.query(Post).filter(Post.is_archived == False)
    
    # Apply filters
    if filters.author_id:
        query = query.filter(Post.author_id == filters.author_id)
    
    if filters.post_type:
        query = query.filter(Post.post_type == filters.post_type)
    
    # Posts are publicly viewable for everyone.
    if filters.visibility == PostVisibility.PUBLIC:
        query = query.filter(Post.is_archived == False)
    
    if filters.is_pinned is not None:
        query = query.filter(Post.is_pinned == filters.is_pinned)
    
    if filters.start_date:
        query = query.filter(Post.created_at >= filters.start_date)
    
    if filters.end_date:
        query = query.filter(Post.created_at <= filters.end_date)
    
    if filters.search_query:
        search_terms = f"%{filters.search_query}%"
        query = query.filter(
            or_(
                Post.title.ilike(search_terms),
                Post.content.ilike(search_terms)
            )
        )
    
    if filters.tags:
        # Filter by tags
        query = query.join(Post.post_tags).join(PostTag.tag).filter(
            Tag.name.in_(filters.tags)
        ).group_by(Post.id)
    
    # Get total count
    total = query.count()
    
    # Apply sorting
    sort_column = getattr(Post, filters.sort_by, Post.created_at)
    if filters.sort_order == "desc":
        query = query.order_by(desc(Post.is_pinned), desc(sort_column), desc(Post.created_at))
    else:
        query = query.order_by(desc(Post.is_pinned), asc(sort_column), desc(Post.created_at))
    
    # Apply pagination
    posts = query.options(
        joinedload(Post.author),
        joinedload(Post.likes),
        joinedload(Post.post_tags).joinedload(PostTag.tag)
    ).offset(skip).limit(limit).all()
    
    return posts, total

def increment_view_count(db: Session, post_id: int) -> None:
    """
    Increment post view count
    """
    db_post = get_post(db, post_id)
    if db_post:
        db_post.view_count += 1
        db.commit()

# Like Services
def toggle_like(db: Session, post_id: int, user_id: int) -> dict:
    """
    Toggle like on a post
    """
    # Check if post exists
    post = get_post(db, post_id)
    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found"
        )
    
    # Check if already liked
    existing_like = db.query(Like).filter(
        and_(
            Like.post_id == post_id,
            Like.user_id == user_id
        )
    ).first()
    
    try:
        if existing_like:
            # Unlike
            db.delete(existing_like)
            post.like_count = max(0, post.like_count - 1)
            action = "unliked"
        else:
            # Like
            new_like = Like(post_id=post_id, user_id=user_id)
            db.add(new_like)
            post.like_count += 1
            action = "liked"
        
        db.commit()
        
        return {
            "message": f"Post {action} successfully",
            "liked": not existing_like,
            "like_count": post.like_count
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error toggling like: {str(e)}"
        )

def get_post_likes(db: Session, post_id: int, skip: int = 0, limit: int = 50) -> Tuple[List[Like], int]:
    """
    Get likes for a post
    """
    query = db.query(Like).filter(Like.post_id == post_id)
    total = query.count()
    likes = query.options(joinedload(Like.user)).offset(skip).limit(limit).all()
    
    return likes, total

# Comment Services
def create_comment(
    db: Session, 
    post_id: int, 
    comment_data: CommentCreate, 
    author_id: int
) -> Comment:
    """
    Create a new comment
    """
    # Check if post exists
    post = get_post(db, post_id)
    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found"
        )
    
    # Check if parent comment exists if provided
    if comment_data.parent_comment_id:
        parent_comment = db.query(Comment).filter(
            and_(
                Comment.id == comment_data.parent_comment_id,
                Comment.post_id == post_id,
                Comment.is_deleted == False
            )
        ).first()
        
        if not parent_comment:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Parent comment not found"
            )
    
    try:
        db_comment = Comment(
            content=comment_data.content,
            post_id=post_id,
            author_id=author_id,
            parent_comment_id=comment_data.parent_comment_id or None
        )
        
        db.add(db_comment)
        
        # Update post comment count
        post.comment_count += 1
        
        db.commit()
        db.refresh(db_comment)
        
        # Load author relationship
        db_comment = db.query(Comment).options(joinedload(Comment.author)).filter(Comment.id == db_comment.id).first()
        
        return db_comment
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating comment: {str(e)}"
        )

def get_comment(db: Session, comment_id: int) -> Optional[Comment]:
    """
    Get a specific comment
    """
    return db.query(Comment).filter(
        and_(
            Comment.id == comment_id,
            Comment.is_deleted == False
        )
    ).first()

def update_comment(
    db: Session, 
    comment_id: int, 
    comment_data: CommentUpdate,
    user_id: int
) -> Comment:
    """
    Update a comment
    """
    db_comment = get_comment(db, comment_id)
    if not db_comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found"
        )
    
    # Check if user is the author
    if db_comment.author_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own comments"
        )
    
    try:
        db_comment.content = comment_data.content
        db_comment.is_edited = True
        db_comment.updated_at = datetime.utcnow()
        
        db.commit()
        db.refresh(db_comment)
        
        return db_comment
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating comment: {str(e)}"
        )

def delete_comment(db: Session, comment_id: int, user_id: int) -> dict:
    """
    Soft delete a comment
    """
    db_comment = get_comment(db, comment_id)
    if not db_comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found"
        )
    
    # Check if user is the author or admin
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    is_admin = is_admin_user(user)
    
    if db_comment.author_id != user_id and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own comments"
        )
    
    try:
        # Soft delete
        db_comment.is_deleted = True
        db_comment.content = "[deleted]"
        db_comment.updated_at = datetime.utcnow()
        
        # Update post comment count
        if not is_admin:  # Don't decrement if admin is deleting
            post = get_post(db, db_comment.post_id)
            if post:
                post.comment_count = max(0, post.comment_count - 1)
        
        db.commit()
        
        return {"message": "Comment deleted successfully"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting comment: {str(e)}"
        )

def get_post_comments(
    db: Session, 
    post_id: int, 
    include_replies: bool = False,
    skip: int = 0, 
    limit: int = 50
) -> Tuple[List[Comment], int]:
    """
    Get comments for a post
    """
    query = db.query(Comment).filter(
        and_(
            Comment.post_id == post_id,
            Comment.is_deleted == False
        )
    )
    
    if not include_replies:
        query = query.filter(
            or_(
                Comment.parent_comment_id == None,
                Comment.parent_comment_id == 0,
            )
        )
    
    total = query.count()
    
    comments = query.options(
        joinedload(Comment.author),
        joinedload(Comment.likes),
        joinedload(Comment.replies).joinedload(Comment.author),
        joinedload(Comment.replies).joinedload(Comment.likes),
    ).order_by(Comment.created_at.asc()).offset(skip).limit(limit).all()
    
    return comments, total

def toggle_comment_like(db: Session, comment_id: int, user_id: int) -> dict:
    """
    Toggle like on a comment
    """
    # Check if comment exists
    comment = get_comment(db, comment_id)
    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found"
        )
    
    # Check if already liked
    existing_like = db.query(CommentLike).filter(
        and_(
            CommentLike.comment_id == comment_id,
            CommentLike.user_id == user_id
        )
    ).first()
    
    try:
        if existing_like:
            # Unlike
            db.delete(existing_like)
            action = "unliked"
        else:
            # Like
            new_like = CommentLike(comment_id=comment_id, user_id=user_id)
            db.add(new_like)
            action = "liked"
        
        db.commit()
        
        return {
            "message": f"Comment {action} successfully",
            "liked": not existing_like
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error toggling comment like: {str(e)}"
        )

# Statistics Services
def get_posts_statistics(db: Session, days: int = 30) -> Dict[str, Any]:
    """
    Get comprehensive posts statistics
    """
    # Date range
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days)
    
    # Total counts
    total_posts = db.query(Post).filter(Post.is_archived == False).count()
    total_comments = db.query(Comment).filter(Comment.is_deleted == False).count()
    total_likes = db.query(Like).count()
    
    # Most active authors (top 10)
    most_active_authors = db.query(
        UserModel.id,
        UserModel.name,
        func.count(Post.id).label('post_count'),
        func.sum(Post.comment_count).label('total_comments'),
        func.sum(Post.like_count).label('total_likes')
    ).join(Post, UserModel.id == Post.author_id).\
        filter(Post.is_archived == False).\
        group_by(UserModel.id, UserModel.name).\
        order_by(desc('post_count')).\
        limit(10).all()
    
    # Popular tags (top 10)
    popular_tags = db.query(
        Tag.id,
        Tag.name,
        func.count(PostTag.post_id).label('usage_count')
    ).join(PostTag, Tag.id == PostTag.tag_id).\
        join(Post, Post.id == PostTag.post_id).\
        filter(Post.is_archived == False).\
        group_by(Tag.id, Tag.name).\
        order_by(desc('usage_count')).\
        limit(10).all()
    
    # Recent activity
    recent_posts = db.query(func.count(Post.id)).\
        filter(
            and_(
                Post.created_at >= start_date,
                Post.is_archived == False
            )
        ).scalar()
    
    recent_comments = db.query(func.count(Comment.id)).\
        filter(
            and_(
                Comment.created_at >= start_date,
                Comment.is_deleted == False
            )
        ).scalar()
    
    return {
        "total_posts": total_posts,
        "total_comments": total_comments,
        "total_likes": total_likes,
        "most_active_authors": [
            {
                "id": author.id,
                "name": author.name,
                "post_count": author.post_count,
                "total_comments": author.total_comments or 0,
                "total_likes": author.total_likes or 0
            }
            for author in most_active_authors
        ],
        "popular_tags": [
            {
                "id": tag.id,
                "name": tag.name,
                "usage_count": tag.usage_count
            }
            for tag in popular_tags
        ],
        "recent_activity": {
            "posts_last_30_days": recent_posts,
            "comments_last_30_days": recent_comments
        }
    }

def get_user_feed(
    db: Session, 
    user_id: int,
    skip: int = 0,
    limit: int = 20
) -> Tuple[List[Post], int]:
    """
    Get personalized feed for user
    """
    # All posts are publicly viewable, so the signed-in feed mirrors the public feed.
    # You can enhance this with recommendation algorithms
    query = db.query(Post).filter(Post.is_archived == False).order_by(desc(Post.created_at))
    
    total = query.count()
    posts = query.options(
        joinedload(Post.author),
        joinedload(Post.post_tags).joinedload(PostTag.tag)
    ).offset(skip).limit(limit).all()
    
    return posts, total
