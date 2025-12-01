import sys
from getpass import getpass
from core.database import SessionLocal
from apps.auth.models import UserModel, Role
from apps.auth.services import get_password_hash, initialize_default_roles

def create_admin():
    db = SessionLocal()
    
    # Initialize default roles
    initialize_default_roles(db)
    
    # Ensure 'admin' role exists
    admin_role = db.query(Role).filter(Role.name == "admin").first()
    if not admin_role:
        print("❌ Admin role not found even after initialization")
        return
    
    email = input("Admin email: ")
    name = input("Admin name: ")
    password = getpass("Admin password: ")
    
    # Check if user already exists
    existing_user = db.query(UserModel).filter(UserModel.email == email).first()
    if existing_user:
        print("❌ User with this email already exists")
        return
    
    hashed_password = get_password_hash(password)
    admin = UserModel(name=name, email=email, hashed_password=hashed_password, role=admin_role)
    db.add(admin)
    db.commit()
    print("✅ Admin account created successfully.")

if __name__ == "__main__":
    create_admin()