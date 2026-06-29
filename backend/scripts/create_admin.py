"""
Create or promote a user to admin.
Usage: python scripts/create_admin.py <email> <password> [full_name]
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal
from app.core.security import get_password_hash
from app.models.user import User


def create_admin(email: str, password: str, full_name: str = "Admin"):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.is_admin = True
            user.is_active = True
            db.commit()
            print(f"✅ User '{email}' promoted to admin.")
        else:
            user = User(
                email=email,
                hashed_password=get_password_hash(password),
                full_name=full_name,
                is_active=True,
                is_admin=True,
            )
            db.add(user)
            db.commit()
            print(f"✅ Admin user '{email}' created.")
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python scripts/create_admin.py <email> <password> [full_name]")
        sys.exit(1)
    create_admin(
        email=sys.argv[1],
        password=sys.argv[2],
        full_name=sys.argv[3] if len(sys.argv) > 3 else "Admin",
    )
