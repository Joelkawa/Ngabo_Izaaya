from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./ngabo.db"  # Default to SQLite

    model_config = {
        "env_file": ".env",
        "case_sensitive": True,
    }


settings = Settings()

# Handle SQLite special case
if settings.DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        settings.DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
else:
    engine = create_engine(settings.DATABASE_URL)

# Create a session local to the database
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# The base for all declarative SQLAlchemy models
Base = declarative_base()


# Dependency to get DB session (FastAPI style)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
