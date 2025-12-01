from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_, func, desc
from typing import List, Optional, Tuple, Dict, Any
import base64
import uuid
from fastapi import HTTPException, status, UploadFile
from datetime import datetime, timedelta
import io

from apps.messages.models import (
    Conversation, ConversationParticipant, Message, 
    UserStatusUpdate, ReadReceipt, MessageType, 
    MessageStatus, ConversationType, UserStatus
)
from apps.messages.schemas import (
    MessageCreate, MessageUpdate, ConversationCreate,
    UserStatusUpdateCreate, TypingIndicator, MarkMessagesRead
)
from apps.auth.models import UserModel

# Constants
MAX_MEDIA_SIZE = 16 * 1024 * 1024  # 16MB
ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
ALLOWED_VOICE_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm']

# Conversation Services
def create_conversation(
    db: Session, 
    conversation_data: ConversationCreate, 
    user_id: int
) -> Conversation:
    """
    Create a new conversation
    """
    try:
        # For direct messages, check if conversation already exists
        if conversation_data.conversation_type == ConversationType.DIRECT:
            if len(conversation_data.participant_ids) != 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Direct messages must have exactly one other participant"
                )
            
            other_user_id = conversation_data.participant_ids[0]
            existing_conv = get_direct_conversation(db, user_id, other_user_id)
            if existing_conv:
                return existing_conv

        # Create new conversation
        db_conversation = Conversation(
            name=conversation_data.name,
            conversation_type=conversation_data.conversation_type,
            created_by=user_id
        )
        
        db.add(db_conversation)
        db.flush()  # Get the ID without committing
        
        # Add participants
        participants = [user_id] + conversation_data.participant_ids
        unique_participants = list(set(participants))
        
        for participant_id in unique_participants:
            db_participant = ConversationParticipant(
                conversation_id=db_conversation.id,
                user_id=participant_id,
                is_admin=(participant_id == user_id)  # Creator is admin
            )
            db.add(db_participant)
        
        db.commit()
        db.refresh(db_conversation)
        return db_conversation
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating conversation: {str(e)}"
        )

def get_direct_conversation(db: Session, user1_id: int, user2_id: int) -> Optional[Conversation]:
    """
    Find existing direct conversation between two users
    """
    return db.query(Conversation).join(ConversationParticipant).filter(
        and_(
            Conversation.conversation_type == ConversationType.DIRECT,
            ConversationParticipant.user_id.in_([user1_id, user2_id])
        )
    ).group_by(Conversation.id).having(
        func.count(ConversationParticipant.user_id) == 2
    ).first()

def get_conversation(db: Session, conversation_id: int, user_id: int) -> Optional[Conversation]:
    """
    Get a specific conversation that user is part of
    """
    return db.query(Conversation).join(ConversationParticipant).filter(
        and_(
            Conversation.id == conversation_id,
            ConversationParticipant.user_id == user_id
        )
    ).first()

def get_user_conversations(db: Session, user_id: int) -> List[Conversation]:
    """
    Get all conversations for a user
    """
    return db.query(Conversation).join(ConversationParticipant).filter(
        ConversationParticipant.user_id == user_id
    ).options(
        joinedload(Conversation.participants).joinedload(ConversationParticipant.user),
        joinedload(Conversation.messages)
    ).order_by(Conversation.updated_at.desc()).all()

def add_participants_to_conversation(
    db: Session, 
    conversation_id: int, 
    user_ids: List[int], 
    current_user_id: int
) -> Conversation:
    """
    Add participants to a conversation (admin only)
    """
    conversation = get_conversation(db, conversation_id, current_user_id)
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
    
    # Check if user is admin
    participant = db.query(ConversationParticipant).filter(
        and_(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id == current_user_id,
            ConversationParticipant.is_admin == True
        )
    ).first()
    
    if not participant:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only conversation admins can add participants"
        )
    
    try:
        for user_id in user_ids:
            # Check if user is already a participant
            existing = db.query(ConversationParticipant).filter(
                and_(
                    ConversationParticipant.conversation_id == conversation_id,
                    ConversationParticipant.user_id == user_id
                )
            ).first()
            
            if not existing:
                db_participant = ConversationParticipant(
                    conversation_id=conversation_id,
                    user_id=user_id,
                    is_admin=False
                )
                db.add(db_participant)
        
        db.commit()
        db.refresh(conversation)
        return conversation
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error adding participants: {str(e)}"
        )

# Message Services
def create_message(
    db: Session, 
    message_data: MessageCreate, 
    user_id: int
) -> Message:
    """
    Create a new message
    """
    # Verify user is part of conversation
    conversation = get_conversation(db, message_data.conversation_id, user_id)
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found or access denied"
        )
    
    try:
        media_data = None
        media_size = None
        
        # Handle media data
        if message_data.media_data and message_data.message_type in [MessageType.IMAGE, MessageType.VOICE]:
            try:
                media_data = base64.b64decode(message_data.media_data)
                media_size = len(media_data)
                
                if media_size > MAX_MEDIA_SIZE:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Media file too large. Maximum size is {MAX_MEDIA_SIZE // (1024*1024)}MB"
                    )
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid media data"
                )
        
        db_message = Message(
            conversation_id=message_data.conversation_id,
            sender_id=user_id,
            message_type=message_data.message_type,
            content=message_data.content,
            media_data=media_data,
            media_filename=message_data.media_filename,
            media_size=media_size,
            media_duration=message_data.media_duration,
            replied_to_id=message_data.replied_to_id,
            status=MessageStatus.SENT
        )
        
        db.add(db_message)
        
        # Update conversation updated_at
        conversation.updated_at = func.now()
        
        db.commit()
        db.refresh(db_message)
        return db_message
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating message: {str(e)}"
        )

def get_conversation_messages(
    db: Session, 
    conversation_id: int, 
    user_id: int,
    skip: int = 0, 
    limit: int = 50
) -> Tuple[List[Message], int]:
    """
    Get messages for a conversation
    """
    # Verify user is part of conversation
    conversation = get_conversation(db, conversation_id, user_id)
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found or access denied"
        )
    
    query = db.query(Message).filter(
        Message.conversation_id == conversation_id
    ).options(
        joinedload(Message.sender),
        joinedload(Message.replied_to).joinedload(Message.sender)
    ).order_by(Message.created_at.desc())
    
    total = query.count()
    messages = query.offset(skip).limit(limit).all()
    
    # Return in chronological order
    messages.reverse()
    
    return messages, total

def get_message(db: Session, message_id: int, user_id: int) -> Optional[Message]:
    """
    Get a specific message
    """
    return db.query(Message).join(Conversation).join(ConversationParticipant).filter(
        and_(
            Message.id == message_id,
            ConversationParticipant.user_id == user_id
        )
    ).first()

def update_message_status(
    db: Session, 
    message_id: int, 
    status: MessageStatus, 
    user_id: int
) -> Message:
    """
    Update message status
    """
    message = get_message(db, message_id, user_id)
    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found"
        )
    
    message.status = status
    db.commit()
    db.refresh(message)
    return message

def mark_messages_as_read(
    db: Session, 
    read_data: MarkMessagesRead, 
    user_id: int
) -> Dict[str, Any]:
    """
    Mark messages as read by user
    """
    try:
        for message_id in read_data.message_ids:
            message = get_message(db, message_id, user_id)
            if message and message.sender_id != user_id:  # Don't mark own messages as read
                # Check if read receipt already exists
                existing_receipt = db.query(ReadReceipt).filter(
                    and_(
                        ReadReceipt.message_id == message_id,
                        ReadReceipt.user_id == user_id
                    )
                ).first()
                
                if not existing_receipt:
                    read_receipt = ReadReceipt(
                        message_id=message_id,
                        user_id=user_id
                    )
                    db.add(read_receipt)
                
                # Update message status if all participants have read it
                update_message_status_if_all_read(db, message_id)
        
        db.commit()
        return {"message": "Messages marked as read"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error marking messages as read: {str(e)}"
        )

def update_message_status_if_all_read(db: Session, message_id: int):
    """
    Update message status to READ if all participants have read it
    """
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        return
    
    # Get all participants in conversation
    participants = db.query(ConversationParticipant.user_id).filter(
        ConversationParticipant.conversation_id == message.conversation_id
    ).all()
    
    participant_ids = [p.user_id for p in participants]
    
    # Count read receipts
    read_count = db.query(ReadReceipt).filter(
        and_(
            ReadReceipt.message_id == message_id,
            ReadReceipt.user_id != message.sender_id  # Exclude sender
        )
    ).count()
    
    # If all participants (except sender) have read the message
    if read_count >= len(participant_ids) - 1:
        message.status = MessageStatus.READ
        db.commit()

# User Status Services
def update_user_status(
    db: Session, 
    status_data: UserStatusUpdateCreate, 
    user_id: int
) -> UserStatusUpdate:
    """
    Update user status
    """
    db_status = db.query(UserStatusUpdate).filter(
        UserStatusUpdate.user_id == user_id
    ).first()
    
    if not db_status:
        db_status = UserStatusUpdate(user_id=user_id)
        db.add(db_status)
    
    db_status.status = status_data.status
    db_status.custom_status = status_data.custom_status
    db_status.last_seen = func.now()
    
    db.commit()
    db.refresh(db_status)
    return db_status

def update_typing_status(
    db: Session, 
    typing_data: TypingIndicator, 
    user_id: int
) -> UserStatusUpdate:
    """
    Update user typing status
    """
    db_status = db.query(UserStatusUpdate).filter(
        UserStatusUpdate.user_id == user_id
    ).first()
    
    if not db_status:
        db_status = UserStatusUpdate(user_id=user_id)
        db.add(db_status)
    
    db_status.is_typing = typing_data.is_typing
    db_status.typing_conversation_id = typing_data.conversation_id if typing_data.is_typing else None
    db_status.last_seen = func.now()
    
    db.commit()
    db.refresh(db_status)
    return db_status

def get_online_users(db: Session) -> List[UserStatusUpdate]:
    """
    Get all online users
    """
    five_minutes_ago = datetime.now() - timedelta(minutes=5)
    
    return db.query(UserStatusUpdate).join(UserModel).filter(
        and_(
            UserStatusUpdate.last_seen >= five_minutes_ago,
            UserStatusUpdate.status != UserStatus.OFFLINE
        )
    ).all()

def get_user_status(db: Session, user_id: int) -> Optional[UserStatusUpdate]:
    """
    Get user status
    """
    return db.query(UserStatusUpdate).filter(
        UserStatusUpdate.user_id == user_id
    ).first()

# Utility functions
def get_unread_message_count(db: Session, user_id: int, conversation_id: int = None) -> int:
    """
    Get unread message count for user
    """
    query = db.query(Message).join(Conversation).join(ConversationParticipant).filter(
        and_(
            ConversationParticipant.user_id == user_id,
            Message.sender_id != user_id,  # Don't count own messages
            ~Message.id.in_(
                db.query(ReadReceipt.message_id).filter(
                    ReadReceipt.user_id == user_id
                )
            )
        )
    )
    
    if conversation_id:
        query = query.filter(Message.conversation_id == conversation_id)
    
    return query.count()

def get_conversation_with_metadata(db: Session, conversation_id: int, user_id: int) -> Dict[str, Any]:
    """
    Get conversation with metadata (last message, unread count, etc.)
    """
    conversation = get_conversation(db, conversation_id, user_id)
    if not conversation:
        return None
    
    # Get last message
    last_message = db.query(Message).filter(
        Message.conversation_id == conversation_id
    ).order_by(Message.created_at.desc()).first()
    
    # Get unread count
    unread_count = get_unread_message_count(db, user_id, conversation_id)
    
    return {
        "conversation": conversation,
        "last_message": last_message,
        "unread_count": unread_count
    }