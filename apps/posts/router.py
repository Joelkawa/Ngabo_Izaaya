import json
import os

from fastapi import APIRouter, Depends, HTTPException, status, Query, Path, UploadFile, File, Form
from pydantic import ValidationError
from sqlalchemy.orm import Session
from typing import List, Optional

from apps.posts.schemas import (
    PostCreate, PostUpdate, PostResponse, PostDetailResponse, PostListResponse,
    CommentCreate, CommentUpdate, CommentResponse, CommentListResponse,
    TagCreate, TagResponse, PostFilter, PostStatsResponse, LikeResponse,
    PostType, PostVisibility
)
from apps.posts.services import (
    create_post, get_post, update_post, delete_post,
    get_posts_with_filters, increment_view_count,
    create_comment, get_comment, update_comment, delete_comment,
    get_post_comments, toggle_like, get_post_likes,
    toggle_comment_like, create_tag, get_posts_statistics,
    get_user_feed, infer_post_type, save_post_media_files, get_post_with_relationships
)
from apps.auth.services import get_db, get_current_user, get_current_admin, get_optional_current_user
from apps.auth.models import UserModel
from apps.posts.models import Tag

router = APIRouter()


def serialize_comment(comment) -> dict:
    return CommentResponse.model_validate(comment).model_dump()


def serialize_post(post, current_user_id: Optional[int] = None, include_details: bool = False) -> dict:
    response = PostResponse.model_validate(post).model_dump()
    response["visibility"] = PostVisibility.PUBLIC
    response["has_liked"] = bool(
        current_user_id and any(like.user_id == current_user_id for like in getattr(post, "likes", []))
    )
    return response


def serialize_post_detail(post, comments, likes, current_user_id: Optional[int] = None) -> dict:
    response = PostDetailResponse.model_validate(post).model_dump()
    response["visibility"] = PostVisibility.PUBLIC
    response["has_liked"] = bool(
        current_user_id and any(like.user_id == current_user_id for like in getattr(post, "likes", []))
    )
    response["comments"] = [serialize_comment(comment) for comment in comments]
    response["recent_likes"] = [
        LikeResponse(
            id=like.id,
            user_id=like.user.id,
            user_name=like.user.name,
            created_at=like.created_at,
        ).model_dump()
        for like in likes
    ]
    return response

# Post Endpoints
@router.post(
    "/posts",
    response_model=PostResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new post",
    description="Create a new post with text, images, or videos"
)
def create_new_post(
    post_data: PostCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Create a new post.
    
    - **title**: Post title (optional)
    - **content**: Text content (optional for media posts)
    - **post_type**: Type of post (`TEXT`, `IMAGE`, `VIDEO`, `MIXED`)
    - **media_urls**: List of media URLs (required for image/video posts)
    - **visibility**: Posts are now publicly viewable to everyone
    - **tags**: List of tag names (optional)
    """
    try:
        post = create_post(db, post_data, current_user.id)
        return serialize_post(post, current_user.id)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating post: {str(e)}"
        )


@router.post(
    "/posts/create-with-media",
    response_model=PostResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a post with uploaded media",
    description="Create a new text, image, video, or mixed post from modal form data"
)
def create_new_post_with_media(
    title: Optional[str] = Form(None),
    content: Optional[str] = Form(None),
    visibility: PostVisibility = Form(PostVisibility.PUBLIC),
    tags: Optional[str] = Form(None),
    files: Optional[List[UploadFile]] = File(None),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    uploaded_urls = save_post_media_files(files or [])
    try:
        tag_list = []
        if tags:
            try:
                parsed_tags = json.loads(tags)
                if isinstance(parsed_tags, list):
                    tag_list = [str(tag).strip() for tag in parsed_tags if str(tag).strip()]
            except json.JSONDecodeError:
                tag_list = [tag.strip() for tag in tags.split(",") if tag.strip()]

        post_data = PostCreate(
            title=title,
            content=content,
            post_type=infer_post_type(uploaded_urls, content),
            media_urls=uploaded_urls,
            visibility=visibility,
            tags=tag_list,
        )
        post = create_post(db, post_data, current_user.id)
        return serialize_post(post, current_user.id)
    except HTTPException:
        for uploaded_url in uploaded_urls:
            local_path = uploaded_url.lstrip("/")
            try:
                if os.path.exists(local_path):
                    os.remove(local_path)
            except OSError:
                pass
        raise
    except ValidationError as exc:
        for uploaded_url in uploaded_urls:
            local_path = uploaded_url.lstrip("/")
            try:
                if os.path.exists(local_path):
                    os.remove(local_path)
            except OSError:
                pass
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.errors())
    except Exception:
        for uploaded_url in uploaded_urls:
            local_path = uploaded_url.lstrip("/")
            try:
                if os.path.exists(local_path):
                    os.remove(local_path)
            except OSError:
                pass
        raise

@router.get(
    "/posts",
    response_model=PostListResponse,
    summary="Get posts with filters",
    description="Retrieve posts with advanced filtering and pagination"
)
def get_posts(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=100, description="Number of records to return"),
    author_id: Optional[int] = Query(None, description="Filter by author ID"),
    post_type: Optional[PostType] = Query(None, description="Filter by post type"),
    visibility: Optional[PostVisibility] = Query(None, description="Filter by visibility"),
    tags: Optional[List[str]] = Query(None, description="Filter by tags"),
    is_pinned: Optional[bool] = Query(None, description="Filter pinned posts"),
    search_query: Optional[str] = Query(None, description="Search in title and content"),
    sort_by: str = Query("created_at", description="Field to sort by"),
    sort_order: str = Query("desc", description="Sort order (asc or desc)"),
    db: Session = Depends(get_db),
    current_user: Optional[UserModel] = Depends(get_optional_current_user)
):
    """
    Retrieve posts with various filters.
    """
    try:
        # Build filter object
        filters = PostFilter(
            author_id=author_id,
            post_type=post_type,
            visibility=visibility,
            tags=tags,
            is_pinned=is_pinned,
            search_query=search_query,
            sort_by=sort_by,
            sort_order=sort_order
        )
        
        user_id = current_user.id if current_user else None
        posts, total = get_posts_with_filters(db, filters, user_id, skip, limit)
        
        post_responses = [
            serialize_post(post, user_id)
            for post in posts
        ]
        
        total_pages = (total + limit - 1) // limit if limit > 0 else 1
        
        return PostListResponse(
            items=post_responses,
            total=total,
            page=(skip // limit) + 1 if limit > 0 else 1,
            size=limit,
            total_pages=total_pages
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching posts: {str(e)}"
        )

@router.get(
    "/posts/feed",
    response_model=PostListResponse,
    summary="Get personalized feed",
    description="Get personalized feed of posts for the current user"
)
def get_feed(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=100, description="Number of records to return"),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Get personalized feed of posts.
    """
    try:
        posts, total = get_user_feed(db, current_user.id, skip, limit)
        
        post_responses = [
            serialize_post(post, current_user.id)
            for post in posts
        ]
        
        total_pages = (total + limit - 1) // limit if limit > 0 else 1
        
        return PostListResponse(
            items=post_responses,
            total=total,
            page=(skip // limit) + 1 if limit > 0 else 1,
            size=limit,
            total_pages=total_pages
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching feed: {str(e)}"
        )

@router.get(
    "/posts/{post_id}",
    response_model=PostDetailResponse,
    summary="Get post details",
    description="Retrieve detailed information about a specific post"
)
def get_post_details(
    post_id: int = Path(..., description="ID of the post"),
    db: Session = Depends(get_db),
    current_user: Optional[UserModel] = Depends(get_optional_current_user)
):
    """
    Retrieve detailed information about a specific post.
    """
    try:
        post = get_post_with_relationships(db, post_id)
        if not post:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Post not found"
            )
        
        user_id = current_user.id if current_user else None
        
        # Increment view count
        increment_view_count(db, post_id)
        
        # Get comments
        comments, _ = get_post_comments(db, post_id, include_replies=True, limit=50)
        
        # Get recent likes
        likes, _ = get_post_likes(db, post_id, limit=10)
        
        return serialize_post_detail(post, comments, likes, user_id)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching post: {str(e)}"
        )

@router.put(
    "/posts/{post_id}",
    response_model=PostResponse,
    summary="Update a post",
    description="Update an existing post"
)
def update_post_details(
    post_id: int,
    post_data: PostUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Update an existing post.
    """
    try:
        post = update_post(db, post_id, post_data, current_user.id)
        return serialize_post(post, current_user.id)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating post: {str(e)}"
        )

@router.delete(
    "/posts/{post_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a post",
    description="Archive a post (soft delete)"
)
def delete_post_endpoint(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Archive a post (soft delete).
    """
    try:
        return delete_post(db, post_id, current_user.id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting post: {str(e)}"
        )

@router.post(
    "/posts/{post_id}/like",
    status_code=status.HTTP_200_OK,
    summary="Toggle like on post",
    description="Like or unlike a post"
)
def like_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Toggle like on a post.
    """
    try:
        return toggle_like(db, post_id, current_user.id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error toggling like: {str(e)}"
        )

@router.get(
    "/posts/{post_id}/likes",
    response_model=List[LikeResponse],
    summary="Get post likes",
    description="Get list of users who liked a post"
)
def get_post_likes_list(
    post_id: int,
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(50, ge=1, le=100, description="Number of records to return"),
    db: Session = Depends(get_db),
    current_user: Optional[UserModel] = Depends(get_optional_current_user),
):
    """
    Get list of users who liked a post.
    """
    try:
        post = get_post(db, post_id)
        if not post:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

        likes, _ = get_post_likes(db, post_id, skip, limit)
        
        return [
            LikeResponse(
                id=like.id,
                user_id=like.user.id,
                user_name=like.user.name,
                created_at=like.created_at
            )
            for like in likes
        ]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching likes: {str(e)}"
        )

# Comment Endpoints
@router.post(
    "/posts/{post_id}/comments",
    response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add comment to post",
    description="Add a comment to a post"
)
def add_comment(
    post_id: int,
    comment_data: CommentCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Add a comment to a post.
    
    - **content**: Comment content (required)
    - **parent_comment_id**: ID of parent comment for nested comments (optional)
    """
    try:
        comment = create_comment(db, post_id, comment_data, current_user.id)
        return serialize_comment(comment)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating comment: {str(e)}"
        )

@router.get(
    "/posts/{post_id}/comments",
    response_model=CommentListResponse,
    summary="Get post comments",
    description="Get comments for a post"
)
def get_comments(
    post_id: int,
    include_replies: bool = Query(False, description="Include nested replies"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(50, ge=1, le=100, description="Number of records to return"),
    db: Session = Depends(get_db),
    current_user: Optional[UserModel] = Depends(get_optional_current_user),
):
    """
    Get comments for a post.
    """
    try:
        post = get_post(db, post_id)
        if not post:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

        comments, total = get_post_comments(db, post_id, include_replies, skip, limit)
        
        total_pages = (total + limit - 1) // limit if limit > 0 else 1
        
        return CommentListResponse(
            items=[serialize_comment(comment) for comment in comments],
            total=total,
            page=(skip // limit) + 1 if limit > 0 else 1,
            size=limit,
            total_pages=total_pages
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching comments: {str(e)}"
        )

@router.put(
    "/comments/{comment_id}",
    response_model=CommentResponse,
    summary="Update a comment",
    description="Update an existing comment"
)
def update_comment_details(
    comment_id: int,
    comment_data: CommentUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Update an existing comment.
    """
    try:
        comment = update_comment(db, comment_id, comment_data, current_user.id)
        return serialize_comment(comment)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating comment: {str(e)}"
        )

@router.delete(
    "/comments/{comment_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a comment",
    description="Delete a comment (soft delete)"
)
def delete_comment_endpoint(
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Delete a comment (soft delete).
    """
    try:
        return delete_comment(db, comment_id, current_user.id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting comment: {str(e)}"
        )

@router.post(
    "/comments/{comment_id}/like",
    status_code=status.HTTP_200_OK,
    summary="Toggle like on comment",
    description="Like or unlike a comment"
)
def like_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Toggle like on a comment.
    """
    try:
        return toggle_comment_like(db, comment_id, current_user.id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error toggling comment like: {str(e)}"
        )

# Tag Endpoints
@router.post(
    "/tags",
    response_model=TagResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new tag",
    description="Create a new tag (admin only)"
)
def create_new_tag(
    tag_data: TagCreate,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """
    Create a new tag (admin only).
    """
    try:
        tag = create_tag(db, tag_data)
        return TagResponse.model_validate(tag)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating tag: {str(e)}"
        )

@router.get(
    "/tags",
    response_model=List[TagResponse],
    summary="Get all tags",
    description="Retrieve all available tags"
)
def get_tags(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=200, description="Number of records to return"),
    db: Session = Depends(get_db)
):
    """
    Retrieve all available tags.
    """
    try:
        tags = db.query(Tag).offset(skip).limit(limit).all()
        return [TagResponse.model_validate(tag) for tag in tags]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching tags: {str(e)}"
        )

# Statistics Endpoint
@router.get(
    "/statistics",
    response_model=PostStatsResponse,
    summary="Get posts statistics",
    description="Retrieve comprehensive statistics about posts"
)
def get_statistics(
    days: int = Query(30, ge=1, le=365, description="Number of days for recent activity"),
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """
    Retrieve comprehensive statistics about posts (admin only).
    """
    try:
        stats = get_posts_statistics(db, days)
        return PostStatsResponse(**stats)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching statistics: {str(e)}"
        )
