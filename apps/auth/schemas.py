
from pydantic import BaseModel
from typing import Optional, List


class RoleBase(BaseModel):
    name: str
    description: str = ""

class RoleCreate(RoleBase):
    pass

class Role(RoleBase):
    id: int
    class Config:
        from_attributes = True

class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class RoleResponse(RoleBase):
    id: int
    class Config:
        from_attributes = True 


class UserBase(BaseModel):
    id:int
    name: str
    email: str
    role: str = 'admin'


class UserCreate(BaseModel):
    name: str
    email: str
    role: str = 'admin'
    password: str


class UserUpdate(BaseModel):
    name: Optional[str] = None
    contact: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None


class UserInDB(UserBase):
    hashed_password: str


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None

