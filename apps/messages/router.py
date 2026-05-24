from __future__ import annotations

import base64
from datetime import datetime
from typing import List, Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from sqlalchemy.orm import Session

from apps.auth.models import UserModel
from apps.auth.services import get_current_user, get_db, get_user_from_token_value
from apps.messages.enums import ConversationType, MessageStatus, MessageType, UserStatus
from apps.messages.models import ConversationParticipant, Message
from apps.messages.realtime import connection_manager
from apps.messages.schemas import (
    ContactResponse,
    ConversationCreate,
    ConversationListResponse,
    ConversationResponse,
    MarkMessagesRead,
    MessageCreate,
    MessageListResponse,
    MessageResponse,
    MessagesBootstrapResponse,
    ParticipantResponse,
    TypingIndicator,
    UserReadInfo,
    UserStatusListResponse,
    UserStatusResponse,
    UserStatusUpdateCreate,
)
from apps.messages.services import (
    add_participants_to_conversation,
    clear_typing_status,
    create_conversation,
    create_message,
    delete_message_media_file,
    get_contacts_for_user,
    get_conversation,
    get_conversation_messages,
    get_conversation_participant_ids,
    get_conversation_with_metadata,
    get_conversation_with_relationships,
    get_group_conversations,
    get_message_with_relationships,
    get_online_users,
    get_unread_message_count,
    get_user_conversations,
    mark_messages_as_read,
    save_message_media_file,
    set_user_presence,
    update_message_status,
    update_typing_status,
    update_user_status,
)
from core.database import SessionLocal

router = APIRouter()


def serialize_participant(participant: ConversationParticipant) -> ParticipantResponse:
    return ParticipantResponse(
        id=participant.id,
        user_id=participant.user_id,
        user_name=participant.user.name if participant.user else "Unknown",
        user_email=participant.user.email if participant.user else None,
        is_admin=participant.is_admin,
        joined_at=participant.joined_at,
    )


def serialize_message(message: Message, include_reply: bool = True) -> MessageResponse:
    legacy_media = None
    if message.media_data:
        legacy_media = base64.b64encode(message.media_data).decode("utf-8")

    return MessageResponse(
        id=message.id,
        conversation_id=message.conversation_id,
        sender_id=message.sender_id,
        sender_name=message.sender.name if message.sender else "Unknown",
        message_type=message.message_type,
        content=message.content,
        replied_to_id=message.replied_to_id,
        media_url=message.media_url,
        media_mime_type=message.media_mime_type,
        media_filename=message.media_filename,
        media_data_base64=legacy_media,
        media_size=message.media_size,
        media_duration=message.media_duration,
        status=message.status or MessageStatus.SENT,
        created_at=message.created_at,
        updated_at=message.updated_at,
        replied_to_message=serialize_message(message.replied_to, include_reply=False)
        if include_reply and message.replied_to
        else None,
        read_by=[
            UserReadInfo(
                user_id=receipt.user_id,
                user_name=receipt.user.name if receipt.user else "Unknown",
                read_at=receipt.read_at,
            )
            for receipt in sorted(
                getattr(message, "read_receipts", []),
                key=lambda item: item.read_at,
            )
        ],
    )


def serialize_conversation(
    conversation,
    current_user_id: int,
    unread_count: int = 0,
    last_message: Optional[Message] = None,
) -> ConversationResponse:
    return ConversationResponse(
        id=conversation.id,
        name=conversation.name,
        conversation_type=conversation.conversation_type,
        created_by=conversation.created_by,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        participants=[serialize_participant(participant) for participant in conversation.participants],
        last_message=serialize_message(last_message, include_reply=False) if last_message else None,
        unread_count=unread_count,
    )


def serialize_status(status_record) -> UserStatusResponse:
    return UserStatusResponse(
        user_id=status_record.user_id,
        user_name=status_record.user.name if status_record.user else "Unknown",
        status=status_record.status,
        custom_status=status_record.custom_status,
        is_typing=status_record.is_typing,
        typing_conversation_id=status_record.typing_conversation_id,
        last_seen=status_record.last_seen,
        updated_at=status_record.updated_at,
    )


async def broadcast_presence_update(user_id: int, user_name: str, is_online: bool, last_seen: datetime) -> None:
    await connection_manager.broadcast_to_users(
        connection_manager.connected_user_ids(),
        {
            "type": "presence.updated",
            "data": {
                "user_id": user_id,
                "user_name": user_name,
                "is_online": is_online,
                "last_seen": last_seen.isoformat() if last_seen else None,
            },
        },
    )


async def broadcast_conversation_event(
    db: Session,
    conversation_id: int,
    participant_ids: List[int],
    event_type: str,
) -> None:
    for participant_id in set(participant_ids):
        metadata = get_conversation_with_metadata(db, conversation_id, participant_id)
        if not metadata:
            continue

        payload = serialize_conversation(
            metadata["conversation"],
            participant_id,
            unread_count=metadata["unread_count"],
            last_message=metadata["last_message"],
        ).model_dump(mode="json")
        await connection_manager.send_to_user(
            participant_id,
            {"type": event_type, "data": payload},
        )


async def broadcast_message_created(db: Session, message: Message) -> None:
    participant_ids = get_conversation_participant_ids(db, message.conversation_id)
    message_payload = serialize_message(message).model_dump(mode="json")

    for participant_id in participant_ids:
        metadata = get_conversation_with_metadata(db, message.conversation_id, participant_id)
        if not metadata:
            continue

        await connection_manager.send_to_user(
            participant_id,
            {
                "type": "message.created",
                "data": {
                    "message": message_payload,
                    "conversation": serialize_conversation(
                        metadata["conversation"],
                        participant_id,
                        unread_count=metadata["unread_count"],
                        last_message=metadata["last_message"],
                    ).model_dump(mode="json"),
                },
            },
        )


async def broadcast_messages_read(
    db: Session,
    conversation_id: int,
    reader: UserModel,
    message_ids: List[int],
) -> None:
    if not message_ids:
        return

    participant_ids = get_conversation_participant_ids(db, conversation_id)
    updated_messages = []
    for message_id in message_ids:
        message = get_message_with_relationships(db, message_id)
        if message:
            updated_messages.append(serialize_message(message).model_dump(mode="json"))

    payload = {
        "type": "messages.read",
        "data": {
            "conversation_id": conversation_id,
            "message_ids": message_ids,
            "reader_user_id": reader.id,
            "reader_name": reader.name,
            "messages": updated_messages,
        },
    }
    await connection_manager.broadcast_to_users(participant_ids, payload, exclude_user_id=reader.id)


async def broadcast_typing_event(
    db: Session,
    conversation_id: int,
    sender: UserModel,
    is_typing: bool,
) -> None:
    participant_ids = get_conversation_participant_ids(db, conversation_id)
    await connection_manager.broadcast_to_users(
        participant_ids,
        {
            "type": "typing.updated",
            "data": {
                "conversation_id": conversation_id,
                "user_id": sender.id,
                "user_name": sender.name,
                "is_typing": is_typing,
            },
        },
        exclude_user_id=sender.id,
    )


@router.get(
    "/bootstrap",
    response_model=MessagesBootstrapResponse,
    summary="Get contacts and group chats",
    description="Load the logged-in member's chat contacts and group conversations",
)
def get_messages_bootstrap(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    contacts = [ContactResponse(**contact) for contact in get_contacts_for_user(db, current_user.id)]

    groups = []
    for conversation in get_group_conversations(db, current_user.id):
        metadata = get_conversation_with_metadata(db, conversation.id, current_user.id)
        if not metadata:
            continue
        groups.append(
            serialize_conversation(
                metadata["conversation"],
                current_user.id,
                unread_count=metadata["unread_count"],
                last_message=metadata["last_message"],
            )
        )

    return MessagesBootstrapResponse(contacts=contacts, groups=groups)


@router.post(
    "/conversations/direct/{other_user_id}",
    response_model=ConversationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Get or create a direct conversation",
)
async def create_direct_conversation(
    other_user_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    conversation = create_conversation(
        db,
        ConversationCreate(
            conversation_type=ConversationType.DIRECT,
            participant_ids=[other_user_id],
        ),
        current_user.id,
    )

    metadata = get_conversation_with_metadata(db, conversation.id, current_user.id)
    response = serialize_conversation(
        metadata["conversation"],
        current_user.id,
        unread_count=metadata["unread_count"],
        last_message=metadata["last_message"],
    )

    participant_ids = get_conversation_participant_ids(db, conversation.id)
    await broadcast_conversation_event(db, conversation.id, participant_ids, "conversation.created")
    return response


@router.post(
    "/conversations",
    response_model=ConversationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a conversation",
)
async def create_new_conversation(
    conversation_data: ConversationCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    conversation = create_conversation(db, conversation_data, current_user.id)
    metadata = get_conversation_with_metadata(db, conversation.id, current_user.id)
    response = serialize_conversation(
        metadata["conversation"],
        current_user.id,
        unread_count=metadata["unread_count"],
        last_message=metadata["last_message"],
    )

    participant_ids = get_conversation_participant_ids(db, conversation.id)
    await broadcast_conversation_event(db, conversation.id, participant_ids, "conversation.created")
    return response


@router.get(
    "/conversations",
    response_model=ConversationListResponse,
    summary="Get current user's conversations",
)
def get_conversations(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    items = []
    for conversation in get_user_conversations(db, current_user.id):
        metadata = get_conversation_with_metadata(db, conversation.id, current_user.id)
        if not metadata:
            continue
        items.append(
            serialize_conversation(
                metadata["conversation"],
                current_user.id,
                unread_count=metadata["unread_count"],
                last_message=metadata["last_message"],
            )
        )

    return ConversationListResponse(items=items, total=len(items))


@router.get(
    "/conversations/{conversation_id}",
    response_model=ConversationResponse,
    summary="Get a conversation",
)
def get_specific_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    metadata = get_conversation_with_metadata(db, conversation_id, current_user.id)
    if not metadata:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    return serialize_conversation(
        metadata["conversation"],
        current_user.id,
        unread_count=metadata["unread_count"],
        last_message=metadata["last_message"],
    )


@router.post(
    "/conversations/{conversation_id}/participants",
    response_model=ConversationResponse,
    summary="Add participants to a group conversation",
)
async def add_conversation_participants(
    conversation_id: int,
    user_ids: List[int],
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    conversation = add_participants_to_conversation(db, conversation_id, user_ids, current_user.id)
    metadata = get_conversation_with_metadata(db, conversation.id, current_user.id)
    response = serialize_conversation(
        metadata["conversation"],
        current_user.id,
        unread_count=metadata["unread_count"],
        last_message=metadata["last_message"],
    )

    participant_ids = get_conversation_participant_ids(db, conversation.id)
    await broadcast_conversation_event(db, conversation.id, participant_ids, "conversation.updated")
    return response


@router.post(
    "/messages",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Send a text or legacy message payload",
)
async def send_message(
    message_data: MessageCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    message = create_message(db, message_data, current_user.id)
    serialized = serialize_message(message)
    await broadcast_message_created(db, message)
    await broadcast_typing_event(db, message.conversation_id, current_user, False)
    return serialized


@router.post(
    "/messages/media",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Send an image, video, or voice message",
)
async def send_media_message(
    conversation_id: int = Form(...),
    content: Optional[str] = Form(None),
    replied_to_id: Optional[int] = Form(None),
    media_duration: Optional[int] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    uploaded_media = save_message_media_file(file)

    try:
        message = create_message(
            db,
            MessageCreate(
                conversation_id=conversation_id,
                message_type=uploaded_media["message_type"],
                content=content,
                replied_to_id=replied_to_id,
                media_url=uploaded_media["media_url"],
                media_mime_type=uploaded_media["media_mime_type"],
                media_filename=uploaded_media["media_filename"],
                media_size=uploaded_media["media_size"],
                media_duration=media_duration,
            ),
            current_user.id,
        )
    except Exception:
        delete_message_media_file(uploaded_media["media_url"])
        raise

    serialized = serialize_message(message)
    await broadcast_message_created(db, message)
    await broadcast_typing_event(db, message.conversation_id, current_user, False)
    return serialized


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=MessageListResponse,
    summary="Get messages in a conversation",
)
def get_messages(
    conversation_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    messages, total = get_conversation_messages(db, conversation_id, current_user.id, skip, limit)
    return MessageListResponse(
        items=[serialize_message(message) for message in messages],
        total=total,
        has_more=(skip + limit) < total,
    )


@router.post(
    "/messages/mark-read",
    status_code=status.HTTP_200_OK,
    summary="Mark conversation messages as read",
)
async def mark_messages_read(
    read_data: MarkMessagesRead,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    result = mark_messages_as_read(db, read_data, current_user.id)
    await broadcast_messages_read(db, read_data.conversation_id, current_user, result.get("message_ids", []))
    return result


@router.put(
    "/status",
    response_model=UserStatusResponse,
    summary="Update a member's presence status",
)
async def update_status(
    status_data: UserStatusUpdateCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    status_record = update_user_status(db, status_data, current_user.id)
    await broadcast_presence_update(
        current_user.id,
        current_user.name,
        status_record.status != UserStatus.OFFLINE,
        status_record.last_seen,
    )
    return serialize_status(status_record)


@router.get(
    "/status/online",
    response_model=UserStatusListResponse,
    summary="Get online users",
)
def get_online_users_list(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    items = [serialize_status(status_record) for status_record in get_online_users(db)]
    return UserStatusListResponse(items=items, online_count=len(items))


@router.post(
    "/typing",
    status_code=status.HTTP_200_OK,
    summary="Update typing status",
)
async def update_typing(
    typing_data: TypingIndicator,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    update_typing_status(db, typing_data, current_user.id)
    await broadcast_typing_event(db, typing_data.conversation_id, current_user, typing_data.is_typing)
    return {"message": "Typing status updated"}


@router.get(
    "/unread-count",
    summary="Get unread message count",
)
def get_unread_count(
    conversation_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    return {"unread_count": get_unread_message_count(db, current_user.id, conversation_id)}


@router.get(
    "/conversations/{conversation_id}/messages/new",
    response_model=MessageListResponse,
    summary="Get messages newer than a timestamp",
)
def get_new_messages(
    conversation_id: int,
    since: datetime = Query(...),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    conversation = get_conversation(db, conversation_id, current_user.id)
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found or access denied",
        )

    messages = db.query(Message).filter(
        Message.conversation_id == conversation_id,
        Message.created_at > since,
    ).all()

    enriched_messages = [
        get_message_with_relationships(db, message.id, current_user.id)
        for message in messages
    ]
    items = [serialize_message(message) for message in enriched_messages if message]

    return MessageListResponse(items=items, total=len(items), has_more=False)


@router.websocket("/ws")
async def messages_websocket(websocket: WebSocket):
    token = websocket.query_params.get("token")
    db = SessionLocal()
    try:
        user = get_user_from_token_value(token, db)
    finally:
        db.close()

    if not user:
        await websocket.close(code=4401)
        return

    await connection_manager.connect(user.id, websocket)

    db = SessionLocal()
    try:
        presence = set_user_presence(db, user.id, True)
        clear_typing_status(db, user.id)
    finally:
        db.close()

    await connection_manager.send_to_user(
        user.id,
        {
            "type": "connected",
            "data": {
                "user_id": user.id,
                "user_name": user.name,
            },
        },
    )
    await broadcast_presence_update(user.id, user.name, True, presence.last_seen)

    try:
        while True:
            payload = await websocket.receive_json()
            event_type = payload.get("type")
            data = payload.get("data", {})

            if event_type == "ping":
                db = SessionLocal()
                try:
                    set_user_presence(db, user.id, True)
                finally:
                    db.close()
                continue

            if event_type == "typing":
                conversation_id = data.get("conversation_id")
                is_typing = bool(data.get("is_typing"))
                if not conversation_id:
                    continue

                db = SessionLocal()
                try:
                    update_typing_status(
                        db,
                        TypingIndicator(conversation_id=int(conversation_id), is_typing=is_typing),
                        user.id,
                    )
                    await broadcast_typing_event(db, int(conversation_id), user, is_typing)
                except HTTPException:
                    pass
                finally:
                    db.close()
                continue

            if event_type == "status":
                status_value = data.get("status", UserStatus.ONLINE)
                custom_status = data.get("custom_status")
                db = SessionLocal()
                try:
                    presence = update_user_status(
                        db,
                        UserStatusUpdateCreate(status=status_value, custom_status=custom_status),
                        user.id,
                    )
                finally:
                    db.close()
                await broadcast_presence_update(
                    user.id,
                    user.name,
                    presence.status != UserStatus.OFFLINE,
                    presence.last_seen,
                )
    except WebSocketDisconnect:
        pass
    finally:
        connection_manager.disconnect(user.id, websocket)
        if not connection_manager.has_active_connections(user.id):
            db = SessionLocal()
            try:
                presence = set_user_presence(db, user.id, False)
            finally:
                db.close()
            await broadcast_presence_update(user.id, user.name, False, presence.last_seen)
