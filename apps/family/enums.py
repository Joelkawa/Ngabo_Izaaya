import enum
class Gender(enum.Enum):
    MALE = "MALE"
    FEMALE = "FEMALE"
    OTHER = "OTHER"

class LifeStatus(enum.Enum):
    LIVING = "LIVING"
    DECEASED = "DECEASED"
    UNKNOWN = "UNKNOWN"

class RelationshipType(enum.Enum):
    PARENT = "PARENT"
    CHILD = "CHILD"
    SPOUSE = "SPOUSE"
    SIBLING = "SIBLING"