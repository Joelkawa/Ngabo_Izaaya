import enum

class MessageType(enum.Enum):
    TEXT = "TEXT"
    IMAGE = "IMAGE"
    VIDEO = "VIDEO"
    VOICE = "VOICE"
    STATUS = "STATUS"

class MessageStatus(enum.Enum):
    SENT = "SENT"
    DELIVERED = "DELIVERED"
    READ = "READ"

class ConversationType(enum.Enum):
    DIRECT = "DIRECT"
    GROUP = "GROUP"
class UserStatus(enum.Enum):
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"
    AWAY = "AWAY"
    BUSY = "BUSY"
