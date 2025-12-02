from pydantic import BaseModel, ConfigDict, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

# Enums matching database
class PostType(str, Enum):
    TEXT = "TEXT"
    IMAGE = "IMAGE"
    VIDEO = "VIDEO"
    MIXED = "MIXED"

class PostVisibility(str, Enum):
    PUBLIC = "PUBLIC"
    FAMILY_ONLY = "FAMILY_ONLY"
    PRIVATE = "PRIVATE"

# Base schemas
class TagBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    description: Optional[str] = Field(None, max_length=200)

class TagCreate(TagBase):
    pass

class TagResponse(TagBase):
    id: int
    slug: str
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class PostBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200, description="Post title")
    content: Optional[str] = Field(None, description="Text content of the post")
    post_type: PostType = Field(PostType.TEXT, description="Type of post")
    media_urls: Optional[List[str]] = Field(None, description="List of media URLs")
    visibility: PostVisibility = Field(PostVisibility.FAMILY_ONLY, description="Who can see this post")
    tags: Optional[List[str]] = Field([], description="List of tag names")
    
    @validator('media_urls')
    def validate_media_urls(cls, v, values):
        if v and len(v) > 10:
            raise ValueError("Maximum 10 media items allowed per post")
        return v
    
    @validator('post_type')
    def validate_post_type(cls, v, values):
        if v == PostType.TEXT and not values.get('content'):
            raise ValueError("Text posts must have content")
        if v in [PostType.IMAGE, PostType.VIDEO] and not values.get('media_urls'):
            raise ValueError(f"{v.value.capitalize()} posts must have media URLs")
        return v

class PostCreate(PostBase):
    pass

class PostUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    content: Optional[str] = None
    media_urls: Optional[List[str]] = None
    visibility: Optional[PostVisibility] = None
    is_pinned: Optional[bool] = None
    is_archived: Optional[bool] = None
    tags: Optional[List[str]] = None

# User info for responses
class AuthorInfo(BaseModel):
    id: int
    name: str
    email: str
    
    model_config = ConfigDict(from_attributes=True)

class CommentAuthorInfo(BaseModel):
    id: int
    name: str
    
    model_config = ConfigDict(from_attributes=True)

# Comment schemas
class CommentBase(BaseModel):
    content: str = Field(..., min_length=1, max_length=1000, description="Comment content")
    parent_comment_id: Optional[int] = Field(None, description="ID of parent comment for nested comments")

class CommentCreate(CommentBase):
    pass

class CommentUpdate(BaseModel):
    content: str = Field(..., min_length=1, max_length=1000)

class CommentResponse(CommentBase):
    id: int
    post_id: int
    author_id: int
    author: CommentAuthorInfo
    is_edited: bool
    is_deleted: bool
    like_count: int = 0
    reply_count: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True)

# Post response with relationships
class PostResponse(PostBase):
    id: int
    author_id: int
    author: AuthorInfo
    is_pinned: bool
    is_archived: bool
    like_count: int
    comment_count: int
    view_count: int
    tags: List[TagResponse] = []
    created_at: datetime
    updated_at: Optional[datetime] = None
    published_at: Optional[datetime] = None
    has_liked: bool = False  # Whether current user has liked this post
    
    model_config = ConfigDict(from_attributes=True)

# Like schemas
class LikeResponse(BaseModel):
    id: int
    user_id: int
    user_name: str
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

# Detailed post with comments
class PostDetailResponse(PostResponse):
    comments: List[CommentResponse] = []
    recent_likes: List[LikeResponse] = []

# Feed and list responses
class PostListResponse(BaseModel):
    items: List[PostResponse]
    total: int
    page: int
    size: int
    total_pages: int

class CommentListResponse(BaseModel):
    items: List[CommentResponse]
    total: int
    page: int
    size: int
    total_pages: int

# Statistics
class PostStatsResponse(BaseModel):
    total_posts: int
    total_comments: int
    total_likes: int
    most_active_authors: List[Dict[str, Any]]
    popular_tags: List[Dict[str, Any]]

# Search and filter
class PostFilter(BaseModel):
    author_id: Optional[int] = None
    post_type: Optional[PostType] = None
    visibility: Optional[PostVisibility] = None
    tags: Optional[List[str]] = None
    is_pinned: Optional[bool] = None
    is_archived: Optional[bool] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    search_query: Optional[str] = None
    sort_by: str = "created_at"
    sort_order: str = "desc"  # "asc" or "desc"