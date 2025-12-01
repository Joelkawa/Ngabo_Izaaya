from fastapi import APIRouter, Depends, HTTPException, status, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from typing import List, Optional, Dict
import json
from datetime import datetime

from apps.messages.schemas import (
    MessageCreate, MessageUpdate, MessageResponse, MessageListResponse,
    ConversationCreate, ConversationResponse, ConversationListResponse,
    UserStatusUpdateCreate, UserStatusResponse, UserStatusListResponse,
    TypingIndicator, MarkMessagesRead, WebSocketMessage
)
from apps.messages.services import (
    create_conversation, get_conversation, get_user_conversations,
    add_participants_to_conversation,
    create_message, get_conversation_messages, get_message,
    mark_messages_as_read, update_message_status,
    update_user_status, update_typing_status, get_online_users, get_user_status,
    get_unread_message_count, get_conversation_with_metadata
)
from apps.auth.services import get_db, get_current_user
from apps.auth.models import UserModel

router = APIRouter()

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, WebSocket] = {}
    
    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        self.active_connections[user_id] = websocket
    
    def disconnect(self, user_id: int):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
    
    async def send_personal_message(self, message: str, user_id: int):
        if user_id in self.active_connections:
            await self.active_connections[user_id].send_text(message)
    
    async def broadcast(self, message: str, exclude_user_id: Optional[int] = None):
        for user_id, connection in self.active_connections.items():
            if user_id != exclude_user_id:
                await connection.send_text(message)

manager = ConnectionManager()

# WebSocket endpoint
@router.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int, db: Session = Depends(get_db)):
    await manager.connect(websocket, user_id)
    try:
        # Update user status to online
        status_update = UserStatusUpdateCreate(status="online")
        update_user_status(db, status_update, user_id)
        
        # Broadcast online status
        online_message = WebSocketMessage(
            type="user_online",
            data={"user_id": user_id}
        )
        await manager.broadcast(online_message.model_dump_json())
        
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            ws_message = WebSocketMessage(**message_data)
            
            # Handle different message types
            if ws_message.type == "typing":
                typing_data = TypingIndicator(**ws_message.data)
                update_typing_status(db, typing_data, user_id)
                
                # Broadcast typing indicator to conversation participants
                broadcast_message = WebSocketMessage(
                    type="typing_indicator",
                    data={
                        "user_id": user_id,
                        "conversation_id": typing_data.conversation_id,
                        "is_typing": typing_data.is_typing
                    }
                )
                await manager.broadcast(broadcast_message.model_dump_json(), user_id)
                
            elif ws_message.type == "message_read":
                read_data = MarkMessagesRead(**ws_message.data)
                mark_messages_as_read(db, read_data, user_id)
                
    except WebSocketDisconnect:
        manager.disconnect(user_id)
        
        # Update user status to offline
        status_update = UserStatusUpdateCreate(status="offline")
        update_user_status(db, status_update, user_id)
        
        # Broadcast offline status
        offline_message = WebSocketMessage(
            type="user_offline",
            data={"user_id": user_id}
        )
        await manager.broadcast(offline_message.model_dump_json())

# Conversation Endpoints
@router.post(
    "/conversations",
    response_model=ConversationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new conversation",
    description="Create a new direct or group conversation"
)
def create_new_conversation(
    conversation_data: ConversationCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Create a new conversation.
    
    - For direct messages: provide exactly one participant ID
    - For group chats: provide multiple participant IDs and optionally a name
    """
    conversation = create_conversation(db, conversation_data, current_user.id)
    
    # Build response with participants
    response_data = ConversationResponse.model_validate(conversation)
    response_data.participants = []
    
    for participant in conversation.participants:
        participant_data = {
            "id": participant.id,
            "user_id": participant.user_id,
            "user_name": participant.user.name if participant.user else "Unknown",
            "user_email": participant.user.email if participant.user else "",
            "is_admin": participant.is_admin,
            "joined_at": participant.joined_at
        }
        response_data.participants.append(participant_data)
    
    return response_data

@router.get(
    "/conversations",
    response_model=ConversationListResponse,
    summary="Get user conversations",
    description="Retrieve all conversations for the current user"
)
def get_conversations(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Retrieve all conversations for the current user.
    """
    conversations = get_user_conversations(db, current_user.id)
    
    conversation_responses = []
    for conversation in conversations:
        # Get conversation metadata
        metadata = get_conversation_with_metadata(db, conversation.id, current_user.id)
        
        response_data = ConversationResponse.model_validate(conversation)
        response_data.participants = []
        response_data.unread_count = metadata["unread_count"] if metadata else 0
        response_data.last_message = MessageResponse.model_validate(metadata["last_message"]) if metadata and metadata["last_message"] else None
        
        for participant in conversation.participants:
            participant_data = {
                "id": participant.id,
                "user_id": participant.user_id,
                "user_name": participant.user.name if participant.user else "Unknown",
                "user_email": participant.user.email if participant.user else "",
                "is_admin": participant.is_admin,
                "joined_at": participant.joined_at
            }
            response_data.participants.append(participant_data)
        
        conversation_responses.append(response_data)
    
    return ConversationListResponse(
        items=conversation_responses,
        total=len(conversation_responses)
    )

@router.post(
    "/conversations/{conversation_id}/participants",
    response_model=ConversationResponse,
    summary="Add participants to conversation",
    description="Add participants to a group conversation (Admin only)"
)
def add_conversation_participants(
    conversation_id: int,
    user_ids: List[int],
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Add participants to a group conversation.
    - Only conversation admins can add participants
    """
    conversation = add_participants_to_conversation(db, conversation_id, user_ids, current_user.id)
    
    response_data = ConversationResponse.model_validate(conversation)
    response_data.participants = []
    
    for participant in conversation.participants:
        participant_data = {
            "id": participant.id,
            "user_id": participant.user_id,
            "user_name": participant.user.name if participant.user else "Unknown",
            "user_email": participant.user.email if participant.user else "",
            "is_admin": participant.is_admin,
            "joined_at": participant.joined_at
        }
        response_data.participants.append(participant_data)
    
    return response_data

# Message Endpoints
@router.post(
    "/messages",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Send a message",
    description="Send a text, image, voice, or status message"
)
def send_message(
    message_data: MessageCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Send a message to a conversation.
    
    - **conversation_id**: ID of the conversation (required)
    - **message_type**: Type of message (text, image, voice, status)
    - **content**: Text content for text messages
    - **media_data**: Base64 encoded media for images/voice messages
    - **media_filename**: Original filename for media
    - **replied_to_id**: ID of message being replied to
    """
    message = create_message(db, message_data, current_user.id)
    
    response_data = MessageResponse.model_validate(message)
    response_data.sender_name = current_user.name
    
    # TODO: Broadcast via WebSocket
    
    return response_data

@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=MessageListResponse,
    summary="Get conversation messages",
    description="Retrieve messages from a conversation"
)
def get_messages(
    conversation_id: int,
    skip: int = Query(0, ge=0, description="Number of messages to skip"),
    limit: int = Query(50, ge=1, le=100, description="Number of messages to return"),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Retrieve messages from a conversation with pagination.
    """
    messages, total = get_conversation_messages(
        db, conversation_id, current_user.id, skip, limit
    )
    
    message_responses = []
    for message in messages:
        response_data = MessageResponse.model_validate(message)
        response_data.sender_name = message.sender.name if message.sender else "Unknown"
        
        if message.replied_to:
            replied_data = MessageResponse.model_validate(message.replied_to)
            replied_data.sender_name = message.replied_to.sender.name if message.replied_to.sender else "Unknown"
            response_data.replied_to_message = replied_data
        
        message_responses.append(response_data)
    
    return MessageListResponse(
        items=message_responses,
        total=total,
        has_more=(skip + limit) < total
    )

@router.post(
    "/messages/mark-read",
    status_code=status.HTTP_200_OK,
    summary="Mark messages as read",
    description="Mark messages as read by the current user"
)
def mark_messages_read(
    read_data: MarkMessagesRead,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Mark messages as read.
    """
    return mark_messages_as_read(db, read_data, current_user.id)

# Status Endpoints
@router.put(
    "/status",
    response_model=UserStatusResponse,
    summary="Update user status",
    description="Update online status and custom status message"
)
def update_status(
    status_data: UserStatusUpdateCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Update user status and custom status message.
    """
    status_update = update_user_status(db, status_data, current_user.id)
    
    response_data = UserStatusResponse.model_validate(status_update)
    response_data.user_name = current_user.name
    
    # TODO: Broadcast via WebSocket
    
    return response_data

@router.get(
    "/status/online",
    response_model=UserStatusListResponse,
    summary="Get online users",
    description="Retrieve list of currently online users"
)
def get_online_users_list(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Retrieve list of currently online users.
    """
    online_users = get_online_users(db)
    
    user_responses = []
    for user_status in online_users:
        response_data = UserStatusResponse.model_validate(user_status)
        response_data.user_name = user_status.user.name if user_status.user else "Unknown"
        user_responses.append(response_data)
    
    return UserStatusListResponse(
        items=user_responses,
        online_count=len(user_responses)
    )

@router.post(
    "/typing",
    status_code=status.HTTP_200_OK,
    summary="Update typing status",
    description="Update typing indicator for a conversation"
)
def update_typing(
    typing_data: TypingIndicator,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Update typing indicator for a conversation.
    """
    typing_status = update_typing_status(db, typing_data, current_user.id)
    return {"message": "Typing status updated"}

# Utility Endpoints
@router.get(
    "/unread-count",
    summary="Get unread message count",
    description="Get total unread message count for current user"
)
def get_unread_count(
    conversation_id: Optional[int] = Query(None, description="Specific conversation ID"),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Get unread message count for current user.
    """
    count = get_unread_message_count(db, current_user.id, conversation_id)
    return {"unread_count": count}