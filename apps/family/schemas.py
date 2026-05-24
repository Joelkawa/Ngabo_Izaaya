from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

# Base schemas for Person
class PersonBase(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100, description="First name")
    middle_name: Optional[str] = Field(None, max_length=100, description="Middle name")
    last_name: str = Field(..., min_length=1, max_length=100, description="Last name")
    father_name: Optional[str] = Field(None, description="Father's full name for auto-linking")
    mother_name: Optional[str] = Field(None, description="Mother's full name for auto-linking")
    spouse_name: Optional[str] = Field(None, description="Spouse's full name for auto-linking")

class PersonCreate(PersonBase):
    user_id: Optional[int] = Field(None, description="Link to user account if exists")

class PersonUpdate(BaseModel):
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    middle_name: Optional[str] = Field(None, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    father_name: Optional[str] = None
    mother_name: Optional[str] = None
    spouse_name: Optional[str] = None
    user_id: Optional[int] = None

class PersonResponse(PersonBase):
    id: int
    user_id: Optional[int]
    is_verified: bool
    is_connected_to_tree: bool = False
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    creator_name: Optional[str] = None
    user_account_name: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)

# Relationship schemas
class RelationshipResponse(BaseModel):
    id: int
    relationship_type: str
    parent_id: Optional[int] = None
    child_id: Optional[int] = None
    person1_id: Optional[int] = None
    person2_id: Optional[int] = None
    parent_gender: Optional[str] = None
    parent_name: Optional[str] = None
    child_name: Optional[str] = None
    person1_name: Optional[str] = None
    person2_name: Optional[str] = None
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

# Family Tree Node
class FamilyTreeNode(BaseModel):
    person: PersonResponse
    father: Optional['FamilyTreeNode'] = None
    mother: Optional['FamilyTreeNode'] = None
    spouses: List['FamilyTreeNode'] = []
    children: List['FamilyTreeNode'] = []

# Search and Match schemas
class PersonSearch(BaseModel):
    first_name: str = Field(..., description="First name to search")
    last_name: str = Field(..., description="Last name to search")

class PersonMatchResponse(BaseModel):
    matches: List[PersonResponse] = []
    exact_match: Optional[PersonResponse] = None
    message: str = ""

class AutoAddResponse(BaseModel):
    person: PersonResponse
    relationships_created: List[str] = []
    message: str
    family_connected: bool = False

# Comprehensive Family Tree Response
class ComprehensiveFamilyTree(BaseModel):
    root_person: PersonResponse
    tree: FamilyTreeNode
    total_people: int
    generations: int

# Response schemas for lists
class PersonListResponse(BaseModel):
    items: List[PersonResponse]
    total: int
    page: int
    size: int

# Statistics
class FamilyStatsResponse(BaseModel):
    total_people: int
    generations: int
    connected_to_family: int
    pending_members: int
    verified_count: int
    with_user_accounts: int
    recent_additions: int

# Forward reference resolution
FamilyTreeNode.model_rebuild()
