from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from apps.auth.schemas import UserBase, UserUpdate, UserCreate, Token, RoleCreate, RoleUpdate, RoleResponse
from apps.auth.models import UserModel
from apps.auth.services import (
    get_db, create_user, authenticate_user, get_current_admin,
    create_access_token, get_current_user, get_roles, create_role, update_role, delete_role, get_role,
    get_current_family_member, initialize_default_roles
)
from fastapi.security import OAuth2PasswordRequestForm
from typing import List

router = APIRouter()

# Initialize default roles on startup
@router.on_event("startup")
def init_roles():
    db = next(get_db())
    try:
        initialize_default_roles(db)
    finally:
        db.close()

@router.post("/token", response_model=Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    try:
        user = authenticate_user(db, email=form_data.username, password=form_data.password)
        if not user:
            raise HTTPException(status_code=401, detail="Incorrect email or password")
        access_token = create_access_token(data={"sub": user.email})
        return {"access_token": access_token, "token_type": "bearer"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Unexpected error in token endpoint: {e}")
        raise HTTPException(status_code=500, detail="Internal server error during authentication")

import sys

@router.post("/users", response_model=UserBase)
def create_new_user(user: UserCreate, db: Session = Depends(get_db), admin: UserModel = Depends(get_current_admin)):
    try:
        db_user = create_user(db, user)
        return {
            'id':db_user.id,
            "name": db_user.name,
            "email": db_user.email,
            "role": db_user.role.name if db_user.role else "unknown"

        }
    except Exception as e:
        print(f"Error creating user: {e}", file=sys.stderr)
        raise HTTPException(status_code=500, detail="Error creating user")

@router.get("/users", response_model=List[UserBase])
def list_users(db: Session = Depends(get_db), admin: UserModel = Depends(get_current_admin)):
    """
    Endpoint for admins to list all family members.
    Returns a list of all users with their name, email, and role.
    """
    try:
        users_with_roles = db.query(UserModel).options(joinedload(UserModel.role)).all()
        
        user_list = []
        for user in users_with_roles:
            user_list.append({
                "id": user.id, 
                "name": user.name,
                "email": user.email,
                "role": user.role.name if user.role else "unknown",
            })
        
        return user_list
    except Exception as e:
        print(f"Error listing users: {e}", file=sys.stderr)
        raise HTTPException(status_code=500, detail="An internal server error occurred while fetching users.")

@router.get("/users/me", response_model=UserBase)
def read_users_me(current_user: UserModel = Depends(get_current_family_member)):
    """
    Returns the current authenticated user's details.
    """
    if not current_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not authenticated.")

    user_data = {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role.name if current_user.role else "unknown"
    }
    return user_data

# Role Management Endpoints

@router.post("/roles", response_model=RoleResponse, summary="Create a new role (admin only)")
def create_new_role(role: RoleCreate, db: Session = Depends(get_db), admin: UserModel = Depends(get_current_admin)):
    try:
        return create_role(db, role)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creating role: {e}", file=sys.stderr)
        raise HTTPException(status_code=500, detail="Error creating role")

@router.get("/roles", response_model=List[RoleResponse], summary="Get all roles (admin only)")
def get_all_roles(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), admin: UserModel = Depends(get_current_admin)):
    try:
        roles = get_roles(db, skip=skip, limit=limit)
        return roles
    except Exception as e:
        print(f"Error fetching roles: {e}", file=sys.stderr)
        raise HTTPException(status_code=500, detail="Error fetching roles")

@router.get("/roles/{role_id}", response_model=RoleResponse, summary="Get a specific role (admin only)")
def get_specific_role(role_id: int, db: Session = Depends(get_db), admin: UserModel = Depends(get_current_admin)):
    try:
        role = get_role(db, role_id)
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
        return role
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching role: {e}", file=sys.stderr)
        raise HTTPException(status_code=500, detail="Error fetching role")

@router.put("/roles/{role_id}", response_model=RoleResponse, summary="Update a role (admin only)")
def update_existing_role(role_id: int, role: RoleUpdate, db: Session = Depends(get_db), admin: UserModel = Depends(get_current_admin)):
    try:
        return update_role(db, role_id, role)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating role: {e}", file=sys.stderr)
        raise HTTPException(status_code=500, detail="Error updating role")

@router.delete("/roles/{role_id}", summary="Delete a role (admin only)")
def delete_existing_role(role_id: int, db: Session = Depends(get_db), admin: UserModel = Depends(get_current_admin)):
    try:
        return delete_role(db, role_id)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting role: {e}", file=sys.stderr)
        raise HTTPException(status_code=500, detail="Error deleting role")