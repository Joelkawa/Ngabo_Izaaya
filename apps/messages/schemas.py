from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from .enums import ConversationType, MessageStatus, MessageType, UserStatus


class MessageBase(BaseModel):
    message_type: MessageType = Field(default=MessageType.TEXT, description="Type of message")
    content: Optional[str] = Field(None, description="Message text or optional media caption")
    replied_to_id: Optional[int] = Field(None, description="ID of the message being replied to")


class MessageCreate(MessageBase):
    conversation_id: int = Field(..., description="ID of the conversation")
    media_data: Optional[str] = Field(None, description="Base64 encoded legacy media payload")
    media_url: Optional[str] = Field(None, description="Stored uploads URL for image, video, or audio")
    media_mime_type: Optional[str] = Field(None, description="MIME type of the uploaded media")
    media_filename: Optional[str] = Field(None, description="Original filename for media")
    media_size: Optional[int] = Field(None, ge=0, description="Media size in bytes")
    media_duration: Optional[int] = Field(None, ge=0, description="Duration in seconds for recorded audio")


class MessageUpdate(BaseModel):
    status: Optional[MessageStatus] = None


class UserReadInfo(BaseModel):
    user_id: int
    user_name: str
    read_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MessageResponse(MessageBase):
    id: int
    conversation_id: int
    sender_id: int
    sender_name: Optional[str] = None
    media_url: Optional[str] = None
    media_mime_type: Optional[str] = None
    media_filename: Optional[str] = None
    media_data_base64: Optional[str] = None
    media_size: Optional[int] = None
    media_duration: Optional[int] = None
    status: MessageStatus
    created_at: datetime
    updated_at: Optional[datetime] = None
    replied_to_message: Optional["MessageResponse"] = None
    read_by: List[UserReadInfo] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class ParticipantResponse(BaseModel):
    id: int
    user_id: int
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    is_admin: bool
    joined_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ConversationBase(BaseModel):
    name: Optional[str] = Field(None, max_length=255, description="Name for group conversations")
    conversation_type: ConversationType = Field(default=ConversationType.DIRECT)


class ConversationCreate(ConversationBase):
    participant_ids: List[int] = Field(..., min_items=1, description="User IDs to include in the conversation")


class ConversationResponse(ConversationBase):
    id: int
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    participants: List[ParticipantResponse] = Field(default_factory=list)
    last_message: Optional[MessageResponse] = None
    unread_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class ContactResponse(BaseModel):
    user_id: int
    name: str
    email: Optional[str] = None
    role: str = "user"
    is_online: bool = False
    last_seen: Optional[datetime] = None
    conversation_id: Optional[int] = None
    unread_count: int = 0
    last_message_preview: Optional[str] = None
    last_message_at: Optional[datetime] = None


class MessagesBootstrapResponse(BaseModel):
    contacts: List[ContactResponse]
    groups: List[ConversationResponse]


class UserStatusUpdateBase(BaseModel):
    status: UserStatus = Field(default=UserStatus.ONLINE)
    custom_status: Optional[str] = Field(None, max_length=255, description="Custom status message")


class UserStatusUpdateCreate(UserStatusUpdateBase):
    pass


class UserStatusResponse(UserStatusUpdateBase):
    user_id: int
    user_name: Optional[str] = None
    is_typing: bool = False
    typing_conversation_id: Optional[int] = None
    last_seen: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class TypingIndicator(BaseModel):
    conversation_id: int
    is_typing: bool = True


class MarkMessagesRead(BaseModel):
    message_ids: List[int] = Field(default_factory=list, description="Message IDs to mark as read")
    conversation_id: int = Field(..., description="Conversation ID")


class ConversationListResponse(BaseModel):
    items: List[ConversationResponse]
    total: int


class MessageListResponse(BaseModel):
    items: List[MessageResponse]
    total: int
    has_more: bool


class UserStatusListResponse(BaseModel):
    items: List[UserStatusResponse]
    online_count: int


class WebSocketMessage(BaseModel):
    type: str = Field(..., description="Event type such as message.created or typing.updated")
    data: Dict[str, Any] = Field(default_factory=dict, description="Event payload")


MessageResponse.model_rebuild()
