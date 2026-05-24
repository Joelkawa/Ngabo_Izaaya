from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import quote

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session, joinedload

from apps.auth.models import Role, UserModel
from apps.auth.schemas import PendingUserRequest, RoleCreate, RoleUpdate, UserBase, UserCreate
from core.config import settings
from core.database import get_db
from core.email import send_email

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")
optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token", auto_error=False)
PASSWORD_RESET_TOKEN_TYPE = "password-reset"


def get_password_hash(password):
    return pwd_context.hash(password)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def create_user(db: Session, user: UserCreate):
    validate_password_strength(user.password)

    # Check if user already exists
    existing_user = db.query(UserModel).filter(UserModel.email == user.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    role_obj = db.query(Role).filter(Role.name == user.role).first()
    if not role_obj:
        raise HTTPException(status_code=400, detail=f"Role '{user.role}' does not exist.")
    
    db_user = UserModel(
        name=user.name,
        email=user.email,
        hashed_password=get_password_hash(user.password),
        role=role_obj,
        is_approved=(role_obj.name == "admin"),
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def validate_password_strength(password: str):
    if len(password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long.",
        )
    if not any(character.isupper() for character in password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must include at least one uppercase letter.",
        )
    if not any(character.islower() for character in password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must include at least one lowercase letter.",
        )
    if not any(character.isdigit() for character in password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must include at least one number.",
        )

def authenticate_user(db: Session, email: str, password: str):
    user = db.query(UserModel).filter(UserModel.email == email).first()
    if user and verify_password(password, user.hashed_password):
        return user
    return None

def get_user_by_email(db: Session, email: str):
    return db.query(UserModel).options(joinedload(UserModel.role)).filter(UserModel.email == email).first()

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def get_user_from_token_value(token: str, db: Session) -> Optional[UserModel]:
    if not token:
        return None

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            return None
    except JWTError:
        return None

    return db.query(UserModel).filter(UserModel.email == email).first()

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Your session Expired, Logout and login again into the system",
        headers={"WWW-Authenticate": "Bearer"},
    )
    user = get_user_from_token_value(token, db)
    if user is None:
        raise credentials_exception
    if not user.is_approved:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your membership request is still awaiting admin approval.",
        )
    return user


def get_optional_current_user(
    token: Optional[str] = Depends(optional_oauth2_scheme),
    db: Session = Depends(get_db),
):
    if not token:
        return None
    user = get_user_from_token_value(token, db)
    if user and not user.is_approved:
        return None
    return user


def get_current_admin(current_user: UserModel = Depends(get_current_user)):
    # Check if the user's role is 'admin' using the Role model
    if not current_user.role or current_user.role.name != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")
    return current_user

def get_current_family_member(current_user: UserModel = Depends(get_current_user)):
    if not current_user.role or current_user.role.name not in ["admin", "user"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Family member privileges required")
    return current_user


def create_password_reset_token(email: str, expires_delta: timedelta | None = None) -> str:
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES)
    )
    payload = {
        "sub": email,
        "type": PASSWORD_RESET_TOKEN_TYPE,
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def verify_password_reset_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None

    if payload.get("type") != PASSWORD_RESET_TOKEN_TYPE:
        return None

    email = payload.get("sub")
    if not email:
        return None

    return email


def build_password_reset_link(token: str, base_url: str | None = None) -> str:
    resolved_base_url = (base_url or settings.APP_BASE_URL).rstrip("/")
    return f"{resolved_base_url}/reset-password?token={quote(token)}"


def send_password_reset_email(user: UserModel, base_url: str | None = None):
    token = create_password_reset_token(user.email)
    reset_link = build_password_reset_link(token, base_url)

    text_body = (
        f"Hello {user.name},\n\n"
        "We received a request to reset your Ngabo Izaaya Association password.\n"
        f"Open this link to set a new password: {reset_link}\n\n"
        f"This link expires in {settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES} minutes.\n"
        "If you did not request this, you can ignore this email."
    )

    html_body = f"""
    <html>
        <body style="font-family: Arial, sans-serif; color: #1f2933; line-height: 1.6;">
            <h2 style="margin-bottom: 8px;">Password Reset Request</h2>
            <p>Hello {user.name},</p>
            <p>We received a request to reset your Ngabo Izaaya Association password.</p>
            <p>
                <a href="{reset_link}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#19473a;color:#ffffff;text-decoration:none;font-weight:700;">
                    Reset Password
                </a>
            </p>
            <p>If the button does not open, use this link:</p>
            <p><a href="{reset_link}">{reset_link}</a></p>
            <p>This link expires in {settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES} minutes.</p>
            <p>If you did not request this, you can ignore this email.</p>
        </body>
    </html>
    """

    send_email(
        to_email=user.email,
        subject="Reset your Ngabo Izaaya Association password",
        text_body=text_body,
        html_body=html_body,
    )


def update_user_password(db: Session, user: UserModel, new_password: str) -> UserModel:
    validate_password_strength(new_password)
    user.hashed_password = get_password_hash(new_password)
    db.commit()
    db.refresh(user)
    return user

# Role Management Functions
def get_role(db: Session, role_id: int):
    return db.query(Role).filter(Role.id == role_id).first()

def get_role_by_name(db: Session, name: str):
    return db.query(Role).filter(Role.name == name).first()

def get_roles(db: Session, skip: int = 0, limit: int = 100):
    return db.query(Role).offset(skip).limit(limit).all()

def create_role(db: Session, role: RoleCreate):
    # Check if role already exists
    existing_role = get_role_by_name(db, role.name)
    if existing_role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Role '{role.name}' already exists"
        )
    
    db_role = Role(**role.model_dump())
    db.add(db_role)
    db.commit()
    db.refresh(db_role)
    return db_role

def update_role(db: Session, role_id: int, role: RoleUpdate):
    db_role = get_role(db, role_id)
    if not db_role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Role with ID {role_id} not found"
        )
    
    # Check if new name conflicts with existing role
    if role.name and role.name != db_role.name:
        existing_role = get_role_by_name(db, role.name)
        if existing_role:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Role '{role.name}' already exists"
            )
    
    # Update fields
    update_data = role.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_role, field, value)
    
    db.commit()
    db.refresh(db_role)
    return db_role

def delete_role(db: Session, role_id: int):
    db_role = get_role(db, role_id)
    if not db_role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Role with ID {role_id} not found"
        )
    
    # Check if role is being used by any users
    user_count = db.query(UserModel).filter(UserModel.role_id == role_id).count()
    if user_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete role '{db_role.name}' because it has {user_count} user(s) assigned to it"
        )
    
    db.delete(db_role)
    db.commit()
    return {"message": f"Role '{db_role.name}' deleted successfully"}

def initialize_default_roles(db: Session):
    """Initialize default roles for the family app"""
    default_roles = [
        {"name": "admin", "description": "Family administrator with full access"},
        {"name": "user", "description": "Regular family member"}
    ]
    
    for role_data in default_roles:
        existing_role = get_role_by_name(db, role_data["name"])
        if not existing_role:
            db_role = Role(**role_data)
            db.add(db_role)
    
    db.commit()
    print("✅ Default roles initialized")


def get_approved_users(db: Session):
    return db.query(UserModel).options(joinedload(UserModel.role)).filter(
        UserModel.is_approved.is_(True)
    ).all()


def get_pending_users(db: Session):
    return db.query(UserModel).options(joinedload(UserModel.role)).filter(
        UserModel.is_approved.is_(False)
    ).order_by(UserModel.created_at.asc()).all()


def approve_user_request(db: Session, user_id: int):
    user = db.query(UserModel).options(joinedload(UserModel.role)).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if user.is_approved:
        return user

    user.is_approved = True
    db.commit()
    db.refresh(user)
    return user


def reject_user_request(db: Session, user_id: int):
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if user.is_approved:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Approved members cannot be removed from the requests list.",
        )

    db.delete(user)
    db.commit()
    return {"message": "Membership request removed"}
