from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from .enums import *


# Base schemas
class MessageBase(BaseModel):
    message_type: MessageType = Field(..., description="Type of message")
    content: Optional[str] = Field(None, description="Text content for text messages")
    replied_to_id: Optional[int] = Field(None, description="ID of message being replied to")

class MessageCreate(MessageBase):
    conversation_id: int = Field(..., description="ID of the conversation")
    media_data: Optional[str] = Field(None, description="Base64 encoded media data for images/voice")
    media_filename: Optional[str] = Field(None, description="Original filename for media")
    media_duration: Optional[int] = Field(None, ge=0, description="Duration in seconds for voice messages")

class MessageUpdate(BaseModel):
    status: Optional[MessageStatus] = None

class MessageResponse(MessageBase):
    id: int
    conversation_id: int
    sender_id: int
    sender_name: Optional[str] = None
    media_filename: Optional[str] = None
    media_size: Optional[int] = None
    media_duration: Optional[int] = None
    status: MessageStatus
    created_at: datetime
    updated_at: Optional[datetime] = None
    replied_to_message: Optional['MessageResponse'] = None
    read_by: List['UserReadInfo'] = []
    
    model_config = ConfigDict(from_attributes=True)

class ConversationBase(BaseModel):
    name: Optional[str] = Field(None, max_length=255, description="Name for group conversations")
    conversation_type: ConversationType = Field(default=ConversationType.DIRECT)

class ConversationCreate(ConversationBase):
    participant_ids: List[int] = Field(..., min_items=1, description="List of user IDs to include in conversation")

class ConversationResponse(ConversationBase):
    id: int
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    participants: List['ParticipantResponse'] = []
    last_message: Optional['MessageResponse'] = None
    unread_count: int = 0
    
    model_config = ConfigDict(from_attributes=True)

class ParticipantResponse(BaseModel):
    id: int
    user_id: int
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    is_admin: bool
    joined_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

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

class UserReadInfo(BaseModel):
    user_id: int
    user_name: str
    read_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class TypingIndicator(BaseModel):
    conversation_id: int
    is_typing: bool = True

class MarkMessagesRead(BaseModel):
    message_ids: List[int] = Field(..., description="List of message IDs to mark as read")
    conversation_id: int = Field(..., description="Conversation ID")

# Response schemas for lists
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

# WebSocket schemas
class WebSocketMessage(BaseModel):
    type: str = Field(..., description="Message type: message, typing, status_update, read_receipt")
    data: Dict[str, Any] = Field(..., description="Message data")

# Forward reference resolution
MessageResponse.model_rebuild()