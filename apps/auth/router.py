import sys
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, joinedload
from apps.auth.schemas import (
    MessageResponse,
    PasswordResetConfirm,
    PasswordResetRequest,
    PasswordResetValidation,
    PendingUserRequest,
    RoleCreate,
    RoleResponse,
    RoleUpdate,
    Token,
    UserBase,
    UserCreate,
    UserUpdate,
)
from apps.auth.models import UserModel
from apps.auth.services import (
    get_db, create_user, authenticate_user, get_current_admin,
    create_access_token, get_current_user, get_roles, create_role, update_role, delete_role, get_role,
    get_current_family_member, initialize_default_roles, get_approved_users, get_pending_users,
    approve_user_request, reject_user_request, get_user_by_email, verify_password,
    send_password_reset_email, update_user_password, verify_password_reset_token
)
from fastapi.security import OAuth2PasswordRequestForm

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
        user = get_user_by_email(db, form_data.username)
        if not user or not verify_password(form_data.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Incorrect email or password")
        if not user.is_approved:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your membership request is waiting for admin approval.",
            )
        access_token = create_access_token(data={"sub": user.email})
        return {"access_token": access_token, "token_type": "bearer"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Unexpected error in token endpoint: {e}")
        raise HTTPException(status_code=500, detail="Internal server error during authentication")


@router.post("/password-reset/request", response_model=MessageResponse, summary="Send a password reset link")
def request_password_reset(
    payload: PasswordResetRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    success_message = "If that email exists in our records, a password reset link has been sent."
    user = get_user_by_email(db, payload.email)

    if not user:
        return {"message": success_message}

    try:
        send_password_reset_email(user, base_url=str(request.base_url).rstrip("/"))
        return {"message": success_message}
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except Exception as exc:
        print(f"Error sending password reset email: {exc}", file=sys.stderr)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to send the password reset email right now. Please try again shortly.",
        )


@router.get("/password-reset/validate", response_model=PasswordResetValidation, summary="Validate a password reset token")
def validate_password_reset(token: str):
    email = verify_password_reset_token(token)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link is invalid or has expired.",
        )
    return {"valid": True, "message": "Reset link is valid."}


@router.post("/password-reset/confirm", response_model=MessageResponse, summary="Reset a password using a token")
def confirm_password_reset(
    payload: PasswordResetConfirm,
    db: Session = Depends(get_db),
):
    email = verify_password_reset_token(payload.token)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link is invalid or has expired.",
        )

    user = get_user_by_email(db, email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link is invalid or has expired.",
        )

    update_user_password(db, user, payload.new_password)
    return {"message": "Password reset successful. You can now sign in with your new password."}
@router.post("/users", response_model=UserBase)
def create_new_user(user: UserCreate, db: Session = Depends(get_db)):
    try:
        db_user = create_user(
            db,
            UserCreate(
                name=user.name,
                email=user.email,
                password=user.password,
                role="user",
            ),
        )
        return {
            'id':db_user.id,
            "name": db_user.name,
            "email": db_user.email,
            "role": db_user.role.name if db_user.role else "unknown",
            "is_approved": db_user.is_approved,

        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creating user: {e}", file=sys.stderr)
        raise HTTPException(status_code=500, detail="Error creating user")

@router.get("/users", response_model=List[UserBase])
def list_users(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_family_member),
):
    """
    Endpoint for admins to list all family members.
    Returns a list of all users with their name, email, and role.
    """
    try:
        users_with_roles = get_approved_users(db)
        
        user_list = []
        for user in users_with_roles:
            user_list.append({
                "id": user.id, 
                "name": user.name,
                "email": user.email,
                "role": user.role.name if user.role else "unknown",
                "is_approved": user.is_approved,
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
        "role": current_user.role.name if current_user.role else "unknown",
        "is_approved": current_user.is_approved,
    }
    return user_data


@router.get("/requests", response_model=List[PendingUserRequest], summary="Get pending membership requests (admin only)")
def get_membership_requests(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin),
):
    return [
        {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role.name if user.role else "user",
            "is_approved": user.is_approved,
            "created_at": user.created_at,
        }
        for user in get_pending_users(db)
    ]


@router.post("/requests/{user_id}/approve", response_model=UserBase, summary="Approve membership request (admin only)")
def approve_membership_request(
    user_id: int,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin),
):
    user = approve_user_request(db, user_id)
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role.name if user.role else "unknown",
        "is_approved": user.is_approved,
    }


@router.delete("/requests/{user_id}", summary="Reject membership request (admin only)")
def reject_membership_request(
    user_id: int,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin),
):
    return reject_user_request(db, user_id)

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
