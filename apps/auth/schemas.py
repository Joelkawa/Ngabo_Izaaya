from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime


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
    role: str = 'user'
    is_approved: bool = True


class UserCreate(BaseModel):
    name: str
    email: str
    role: str = 'user'
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


class PendingUserRequest(BaseModel):
    id: int
    name: str
    email: str
    role: str = 'user'
    is_approved: bool = False
    created_at: Optional[datetime] = None


class MessageResponse(BaseModel):
    message: str


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str


class PasswordResetValidation(BaseModel):
    valid: bool
    message: str
