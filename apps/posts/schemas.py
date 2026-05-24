from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
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
    title: Optional[str] = Field(None, max_length=200, description="Optional post title")
    content: Optional[str] = Field(None, description="Text content of the post")
    post_type: PostType = Field(PostType.TEXT, description="Type of post")
    media_urls: List[str] = Field(default_factory=list, description="List of media URLs")
    visibility: PostVisibility = Field(PostVisibility.PUBLIC, description="Posts are publicly viewable")
    tags: List[str] = Field(default_factory=list, description="List of tag names")

    @field_validator("media_urls")
    @classmethod
    def validate_media_urls(cls, value: List[str]):
        if value and len(value) > 10:
            raise ValueError("Maximum 10 media items allowed per post")
        return value

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, value: List[str]):
        return [tag.strip() for tag in value if tag and tag.strip()]

    @model_validator(mode="after")
    def validate_post_payload(self):
        has_content = bool(self.content and self.content.strip())
        has_media = bool(self.media_urls)

        if self.title:
            self.title = self.title.strip() or None

        if self.post_type == PostType.TEXT and not has_content:
            raise ValueError("Text posts must have content")
        if self.post_type in [PostType.IMAGE, PostType.VIDEO] and not has_media:
            raise ValueError(f"{self.post_type.value.capitalize()} posts must have media URLs")
        if self.post_type == PostType.MIXED and not (has_content or has_media):
            raise ValueError("Mixed posts must have content, media, or both")
        return self

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
    tags: List[TagResponse] = Field(default_factory=list)
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
    comments: List[CommentResponse] = Field(default_factory=list)
    recent_likes: List[LikeResponse] = Field(default_factory=list)

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
