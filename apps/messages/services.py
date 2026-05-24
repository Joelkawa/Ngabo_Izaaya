from __future__ import annotations

import base64
import mimetypes
import os
import shutil
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import and_, func
from sqlalchemy.orm import Session, joinedload

from apps.auth.models import UserModel
from apps.messages.enums import ConversationType, MessageStatus, MessageType, UserStatus
from apps.messages.models import (
    Conversation,
    ConversationParticipant,
    Message,
    ReadReceipt,
    UserStatusUpdate,
)
from apps.messages.schemas import (
    ConversationCreate,
    MarkMessagesRead,
    MessageCreate,
    TypingIndicator,
    UserStatusUpdateCreate,
)

MAX_MEDIA_SIZE = 75 * 1024 * 1024
UPLOAD_DIR = "uploads/messages"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".webm", ".m4v", ".mkv"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".ogg", ".webm", ".m4a", ".aac"}
DEFAULT_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "audio/webm": ".webm",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/ogg": ".ogg",
    "audio/mp4": ".m4a",
}


def utcnow() -> datetime:
    return datetime.utcnow()


def is_recently_online(status_update: Optional[UserStatusUpdate]) -> bool:
    if not status_update or status_update.status == UserStatus.OFFLINE:
        return False
    return status_update.last_seen >= utcnow() - timedelta(minutes=5)


def get_status_record(db: Session, user_id: int) -> UserStatusUpdate:
    status_update = db.query(UserStatusUpdate).filter(UserStatusUpdate.user_id == user_id).first()
    if not status_update:
        status_update = UserStatusUpdate(user_id=user_id, status=UserStatus.OFFLINE)
        db.add(status_update)
        db.flush()
    return status_update


def get_conversation_participant_ids(db: Session, conversation_id: int) -> List[int]:
    rows = db.query(ConversationParticipant.user_id).filter(
        ConversationParticipant.conversation_id == conversation_id
    ).all()
    return [row.user_id for row in rows]


def get_direct_conversation(db: Session, user1_id: int, user2_id: int) -> Optional[Conversation]:
    conversation_ids = db.query(Conversation.id).join(ConversationParticipant).filter(
        Conversation.conversation_type == ConversationType.DIRECT,
        ConversationParticipant.user_id.in_([user1_id, user2_id]),
    ).group_by(Conversation.id).having(
        func.count(func.distinct(ConversationParticipant.user_id)) == 2
    ).subquery()

    return db.query(Conversation).filter(Conversation.id.in_(conversation_ids)).options(
        joinedload(Conversation.participants).joinedload(ConversationParticipant.user)
    ).order_by(Conversation.updated_at.desc(), Conversation.created_at.desc()).first()


def get_conversation(db: Session, conversation_id: int, user_id: int) -> Optional[Conversation]:
    return db.query(Conversation).join(ConversationParticipant).filter(
        and_(
            Conversation.id == conversation_id,
            ConversationParticipant.user_id == user_id,
        )
    ).options(
        joinedload(Conversation.participants).joinedload(ConversationParticipant.user)
    ).first()


def get_conversation_with_relationships(db: Session, conversation_id: int, user_id: int) -> Optional[Conversation]:
    return db.query(Conversation).join(ConversationParticipant).filter(
        and_(
            Conversation.id == conversation_id,
            ConversationParticipant.user_id == user_id,
        )
    ).options(
        joinedload(Conversation.participants).joinedload(ConversationParticipant.user),
        joinedload(Conversation.messages).joinedload(Message.sender),
    ).first()


def get_message_with_relationships(db: Session, message_id: int, user_id: Optional[int] = None) -> Optional[Message]:
    query = db.query(Message).options(
        joinedload(Message.sender),
        joinedload(Message.replied_to).joinedload(Message.sender),
        joinedload(Message.read_receipts).joinedload(ReadReceipt.user),
    ).filter(Message.id == message_id)

    if user_id is not None:
        query = query.join(Conversation).join(ConversationParticipant).filter(
            ConversationParticipant.user_id == user_id
        )

    return query.first()


def get_message(db: Session, message_id: int, user_id: int) -> Optional[Message]:
    return get_message_with_relationships(db, message_id, user_id)


def get_user_conversations(db: Session, user_id: int) -> List[Conversation]:
    return db.query(Conversation).join(ConversationParticipant).filter(
        ConversationParticipant.user_id == user_id
    ).options(
        joinedload(Conversation.participants).joinedload(ConversationParticipant.user),
        joinedload(Conversation.messages).joinedload(Message.sender),
    ).order_by(Conversation.updated_at.desc(), Conversation.created_at.desc()).all()


def get_group_conversations(db: Session, user_id: int) -> List[Conversation]:
    return db.query(Conversation).join(ConversationParticipant).filter(
        and_(
            ConversationParticipant.user_id == user_id,
            Conversation.conversation_type == ConversationType.GROUP,
        )
    ).options(
        joinedload(Conversation.participants).joinedload(ConversationParticipant.user),
        joinedload(Conversation.messages).joinedload(Message.sender),
    ).order_by(Conversation.updated_at.desc(), Conversation.created_at.desc()).all()


def validate_participants(db: Session, participant_ids: List[int], current_user_id: int) -> List[int]:
    normalized = []
    for participant_id in participant_ids:
        if participant_id == current_user_id:
            continue
        if participant_id not in normalized:
            normalized.append(participant_id)

    if not normalized:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please choose at least one other member",
        )

    existing_ids = {
        row.id for row in db.query(UserModel.id).filter(UserModel.id.in_(normalized)).all()
    }
    missing = [participant_id for participant_id in normalized if participant_id not in existing_ids]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="One or more selected members could not be found",
        )

    return normalized


def create_conversation(db: Session, conversation_data: ConversationCreate, user_id: int) -> Conversation:
    participant_ids = validate_participants(db, conversation_data.participant_ids, user_id)
    conversation_type = conversation_data.conversation_type

    if conversation_type == ConversationType.DIRECT:
        if len(participant_ids) != 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Direct chats must have exactly one other member",
            )

        existing_conversation = get_direct_conversation(db, user_id, participant_ids[0])
        if existing_conversation:
            return get_conversation_with_relationships(db, existing_conversation.id, user_id)

    if conversation_type == ConversationType.GROUP and not (conversation_data.name or "").strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Group chats need a group name",
        )

    try:
        db_conversation = Conversation(
            name=(conversation_data.name or "").strip() or None,
            conversation_type=conversation_type,
            created_by=user_id,
            updated_at=utcnow(),
        )
        db.add(db_conversation)
        db.flush()

        for participant_id in [user_id] + participant_ids:
            db.add(
                ConversationParticipant(
                    conversation_id=db_conversation.id,
                    user_id=participant_id,
                    is_admin=(participant_id == user_id),
                )
            )

        db.commit()
        return get_conversation_with_relationships(db, db_conversation.id, user_id)
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating conversation: {exc}",
        )


def add_participants_to_conversation(
    db: Session,
    conversation_id: int,
    user_ids: List[int],
    current_user_id: int,
) -> Conversation:
    conversation = get_conversation(db, conversation_id, current_user_id)
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    if conversation.conversation_type != ConversationType.GROUP:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only group chats can receive additional participants",
        )

    admin_record = db.query(ConversationParticipant).filter(
        and_(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id == current_user_id,
            ConversationParticipant.is_admin.is_(True),
        )
    ).first()
    if not admin_record:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only group administrators can add participants",
        )

    participant_ids = validate_participants(db, user_ids, current_user_id)

    try:
        existing_ids = set(get_conversation_participant_ids(db, conversation_id))
        for participant_id in participant_ids:
            if participant_id in existing_ids:
                continue
            db.add(
                ConversationParticipant(
                    conversation_id=conversation_id,
                    user_id=participant_id,
                    is_admin=False,
                )
            )

        conversation.updated_at = utcnow()
        db.commit()
        return get_conversation_with_relationships(db, conversation_id, current_user_id)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error adding participants: {exc}",
        )


def infer_message_type_from_upload(file: UploadFile) -> Tuple[MessageType, str, str]:
    mime_type = (file.content_type or "").lower()
    file_extension = os.path.splitext(file.filename or "")[1].lower()

    if not mime_type:
        mime_type = (mimetypes.guess_type(file.filename or "")[0] or "").lower()

    if mime_type.startswith("image/") or file_extension in IMAGE_EXTENSIONS:
        return MessageType.IMAGE, mime_type or "image/jpeg", file_extension or DEFAULT_EXTENSIONS["image/jpeg"]

    if mime_type.startswith("video/") or file_extension in VIDEO_EXTENSIONS:
        return MessageType.VIDEO, mime_type or "video/mp4", file_extension or DEFAULT_EXTENSIONS["video/mp4"]

    if mime_type.startswith("audio/") or file_extension in AUDIO_EXTENSIONS:
        fallback_mime = mime_type or "audio/webm"
        return MessageType.VOICE, fallback_mime, file_extension or DEFAULT_EXTENSIONS.get(fallback_mime, ".webm")

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Only image, video, or recorded audio files are supported",
    )


def save_message_media_file(file: UploadFile) -> Dict[str, Any]:
    if not file or not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please choose an image, video, or audio file",
        )

    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)

    if file_size > MAX_MEDIA_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Media is too large. Maximum size is {MAX_MEDIA_SIZE // (1024 * 1024)}MB",
        )

    message_type, mime_type, file_extension = infer_message_type_from_upload(file)

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not save uploaded file: {exc}",
        )

    return {
        "message_type": message_type,
        "media_url": f"/uploads/messages/{unique_filename}",
        "media_mime_type": mime_type,
        "media_filename": file.filename,
        "media_size": file_size,
    }


def delete_message_media_file(media_url: Optional[str]) -> None:
    if not media_url or not media_url.startswith("/uploads/messages/"):
        return

    local_path = media_url.lstrip("/")
    if os.path.exists(local_path):
        os.remove(local_path)


def create_message(db: Session, message_data: MessageCreate, user_id: int) -> Message:
    conversation = get_conversation(db, message_data.conversation_id, user_id)
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found or access denied",
        )

    content = (message_data.content or "").strip() or None
    media_blob = None
    media_url = message_data.media_url
    media_mime_type = message_data.media_mime_type

    if message_data.replied_to_id:
        replied_message = get_message(db, message_data.replied_to_id, user_id)
        if not replied_message or replied_message.conversation_id != message_data.conversation_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Reply target was not found in this conversation",
            )

    if message_data.media_data and not media_url:
        try:
            media_blob = base64.b64decode(message_data.media_data)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid legacy media payload",
            )

        if len(media_blob) > MAX_MEDIA_SIZE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Media is too large. Maximum size is {MAX_MEDIA_SIZE // (1024 * 1024)}MB",
            )

    if message_data.message_type == MessageType.TEXT and not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text messages cannot be empty",
        )

    if message_data.message_type in {MessageType.IMAGE, MessageType.VIDEO, MessageType.VOICE} and not (media_url or media_blob):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This message type requires uploaded media",
        )

    try:
        db_message = Message(
            conversation_id=message_data.conversation_id,
            sender_id=user_id,
            message_type=message_data.message_type,
            content=content,
            media_data=media_blob,
            media_url=media_url,
            media_mime_type=media_mime_type,
            media_filename=message_data.media_filename,
            media_size=message_data.media_size or (len(media_blob) if media_blob else None),
            media_duration=message_data.media_duration,
            replied_to_id=message_data.replied_to_id,
            status=MessageStatus.SENT,
            updated_at=utcnow(),
        )
        db.add(db_message)

        conversation.updated_at = utcnow()
        db.commit()
        return get_message_with_relationships(db, db_message.id, user_id)
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating message: {exc}",
        )


def get_conversation_messages(
    db: Session,
    conversation_id: int,
    user_id: int,
    skip: int = 0,
    limit: int = 50,
) -> Tuple[List[Message], int]:
    if not get_conversation(db, conversation_id, user_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found or access denied",
        )

    query = db.query(Message).filter(
        Message.conversation_id == conversation_id
    ).options(
        joinedload(Message.sender),
        joinedload(Message.replied_to).joinedload(Message.sender),
        joinedload(Message.read_receipts).joinedload(ReadReceipt.user),
    ).order_by(Message.created_at.desc(), Message.id.desc())

    total = query.count()
    messages = query.offset(skip).limit(limit).all()
    messages.reverse()
    return messages, total


def update_message_status(
    db: Session,
    message_id: int,
    new_status: MessageStatus,
    user_id: int,
) -> Message:
    message = get_message(db, message_id, user_id)
    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found",
        )

    message.status = new_status
    message.updated_at = utcnow()
    db.commit()
    return get_message_with_relationships(db, message_id, user_id)


def update_message_status_if_all_read(db: Session, message_id: int) -> None:
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        return

    participant_count = db.query(ConversationParticipant).filter(
        ConversationParticipant.conversation_id == message.conversation_id
    ).count()
    read_count = db.query(ReadReceipt).filter(
        and_(
            ReadReceipt.message_id == message_id,
            ReadReceipt.user_id != message.sender_id,
        )
    ).count()

    if participant_count > 1 and read_count >= participant_count - 1:
        message.status = MessageStatus.READ
        message.updated_at = utcnow()


def mark_messages_as_read(
    db: Session,
    read_data: MarkMessagesRead,
    user_id: int,
) -> Dict[str, Any]:
    if not get_conversation(db, read_data.conversation_id, user_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found or access denied",
        )

    target_message_ids = read_data.message_ids
    if not target_message_ids:
        target_message_ids = [
            row.id
            for row in db.query(Message.id).filter(
                and_(
                    Message.conversation_id == read_data.conversation_id,
                    Message.sender_id != user_id,
                )
            ).all()
        ]

    newly_read_ids: List[int] = []

    try:
        for message_id in target_message_ids:
            message = db.query(Message).filter(
                and_(
                    Message.id == message_id,
                    Message.conversation_id == read_data.conversation_id,
                    Message.sender_id != user_id,
                )
            ).first()
            if not message:
                continue

            existing_receipt = db.query(ReadReceipt).filter(
                and_(
                    ReadReceipt.message_id == message_id,
                    ReadReceipt.user_id == user_id,
                )
            ).first()
            if existing_receipt:
                continue

            db.add(ReadReceipt(message_id=message_id, user_id=user_id))
            newly_read_ids.append(message_id)

        db.flush()

        for message_id in newly_read_ids:
            update_message_status_if_all_read(db, message_id)

        if newly_read_ids:
            status_record = get_status_record(db, user_id)
            status_record.last_seen = utcnow()

        db.commit()
        return {
            "message": "Messages marked as read",
            "message_ids": newly_read_ids,
        }
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error marking messages as read: {exc}",
        )


def update_user_status(
    db: Session,
    status_data: UserStatusUpdateCreate,
    user_id: int,
) -> UserStatusUpdate:
    status_record = get_status_record(db, user_id)
    status_record.status = status_data.status
    status_record.custom_status = status_data.custom_status
    status_record.last_seen = utcnow()

    if status_data.status == UserStatus.OFFLINE:
        status_record.is_typing = False
        status_record.typing_conversation_id = None

    db.commit()
    return db.query(UserStatusUpdate).filter(UserStatusUpdate.user_id == user_id).first()


def set_user_presence(db: Session, user_id: int, is_online: bool) -> UserStatusUpdate:
    status_record = get_status_record(db, user_id)
    status_record.status = UserStatus.ONLINE if is_online else UserStatus.OFFLINE
    status_record.last_seen = utcnow()
    if not is_online:
        status_record.is_typing = False
        status_record.typing_conversation_id = None
    db.commit()
    return db.query(UserStatusUpdate).filter(UserStatusUpdate.user_id == user_id).first()


def update_typing_status(
    db: Session,
    typing_data: TypingIndicator,
    user_id: int,
) -> UserStatusUpdate:
    if not get_conversation(db, typing_data.conversation_id, user_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found or access denied",
        )

    status_record = get_status_record(db, user_id)
    status_record.status = UserStatus.ONLINE
    status_record.is_typing = typing_data.is_typing
    status_record.typing_conversation_id = typing_data.conversation_id if typing_data.is_typing else None
    status_record.last_seen = utcnow()
    db.commit()
    return db.query(UserStatusUpdate).filter(UserStatusUpdate.user_id == user_id).first()


def clear_typing_status(db: Session, user_id: int) -> None:
    status_record = db.query(UserStatusUpdate).filter(UserStatusUpdate.user_id == user_id).first()
    if not status_record:
        return

    status_record.is_typing = False
    status_record.typing_conversation_id = None
    status_record.last_seen = utcnow()
    db.commit()


def get_online_users(db: Session) -> List[UserStatusUpdate]:
    five_minutes_ago = utcnow() - timedelta(minutes=5)
    return db.query(UserStatusUpdate).join(UserModel).filter(
        and_(
            UserStatusUpdate.last_seen >= five_minutes_ago,
            UserStatusUpdate.status != UserStatus.OFFLINE,
        )
    ).all()


def get_user_status(db: Session, user_id: int) -> Optional[UserStatusUpdate]:
    return db.query(UserStatusUpdate).filter(UserStatusUpdate.user_id == user_id).first()


def get_unread_message_count(db: Session, user_id: int, conversation_id: Optional[int] = None) -> int:
    query = db.query(Message).join(Conversation).join(ConversationParticipant).filter(
        and_(
            ConversationParticipant.user_id == user_id,
            Message.sender_id != user_id,
            ~Message.id.in_(
                db.query(ReadReceipt.message_id).filter(ReadReceipt.user_id == user_id)
            ),
        )
    )

    if conversation_id is not None:
        query = query.filter(Message.conversation_id == conversation_id)

    return query.count()


def get_last_message(conversation: Conversation) -> Optional[Message]:
    if not conversation.messages:
        return None
    return max(
        conversation.messages,
        key=lambda message: (message.created_at or datetime.min, message.id),
    )


def build_message_preview(message: Optional[Message], viewer_id: Optional[int] = None) -> Optional[str]:
    if not message:
        return None

    if message.message_type == MessageType.TEXT and message.content:
        preview = " ".join(message.content.split())
    elif message.message_type == MessageType.VOICE:
        preview = "Voice message"
    elif message.message_type == MessageType.VIDEO:
        preview = "Video"
    elif message.message_type == MessageType.IMAGE:
        preview = "Video" if (message.media_mime_type or "").startswith("video/") else "Image"
    else:
        preview = message.content or "New message"

    if viewer_id and message.sender_id == viewer_id:
        return f"You: {preview}"
    return preview


def get_conversation_with_metadata(db: Session, conversation_id: int, user_id: int) -> Optional[Dict[str, Any]]:
    conversation = get_conversation_with_relationships(db, conversation_id, user_id)
    if not conversation:
        return None

    last_message = get_last_message(conversation)
    unread_count = get_unread_message_count(db, user_id, conversation_id)

    return {
        "conversation": conversation,
        "last_message": get_message_with_relationships(db, last_message.id, user_id) if last_message else None,
        "unread_count": unread_count,
    }


def get_contacts_for_user(db: Session, user_id: int) -> List[Dict[str, Any]]:
    users = db.query(UserModel).options(joinedload(UserModel.role)).filter(
        UserModel.id != user_id
    ).order_by(UserModel.name.asc()).all()

    direct_conversations = db.query(Conversation).join(ConversationParticipant).filter(
        and_(
            ConversationParticipant.user_id == user_id,
            Conversation.conversation_type == ConversationType.DIRECT,
        )
    ).options(
        joinedload(Conversation.participants).joinedload(ConversationParticipant.user),
        joinedload(Conversation.messages).joinedload(Message.sender),
    ).all()

    direct_by_user_id: Dict[int, Conversation] = {}
    for conversation in direct_conversations:
        other_participant = next(
            (
                participant.user_id
                for participant in conversation.participants
                if participant.user_id != user_id
            ),
            None,
        )
        if other_participant is not None:
            direct_by_user_id[other_participant] = conversation

    status_records = {
        status_record.user_id: status_record
        for status_record in db.query(UserStatusUpdate).all()
    }

    contacts: List[Dict[str, Any]] = []
    for user in users:
        conversation = direct_by_user_id.get(user.id)
        last_message = get_last_message(conversation) if conversation else None
        unread_count = get_unread_message_count(db, user_id, conversation.id) if conversation else 0
        status_record = status_records.get(user.id)

        contacts.append(
            {
                "user_id": user.id,
                "name": user.name,
                "email": user.email,
                "role": user.role.name if user.role else "user",
                "is_online": is_recently_online(status_record),
                "last_seen": status_record.last_seen if status_record else None,
                "conversation_id": conversation.id if conversation else None,
                "unread_count": unread_count,
                "last_message_preview": build_message_preview(last_message, user_id),
                "last_message_at": last_message.created_at if last_message else None,
            }
        )

    contacts.sort(
        key=lambda contact: (
            0 if contact["is_online"] else 1,
            -(contact["last_message_at"].timestamp()) if contact["last_message_at"] else 0,
            contact["name"].lower(),
        )
    )

    return contacts
