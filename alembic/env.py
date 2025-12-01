# File: alembic/env.py
import sys
import os
from pathlib import Path
from logging.config import fileConfig
from sqlalchemy import engine_from_config
from sqlalchemy import pool
from alembic import context

# Add the project root to the path
sys.path.append(str(Path(__file__).parent.parent))

# Import the database Base object
from core.database import Base
target_metadata = Base.metadata

# This function dynamically imports all your models
def import_models():
    apps_path = Path(__file__).parent.parent / 'apps'
    for app_name in os.listdir(apps_path):
        app_dir = apps_path / app_name
        if app_dir.is_dir() and not app_name.startswith('_'):
            models_path = app_dir / 'models.py'
            if models_path.is_file():
                import_path = f'apps.{app_name}.models'
                __import__(import_path)

import_models()

# This is the Alembic Config object, which provides access to the values within the .ini file
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
fileConfig(config.config_file_name)


def run_migrations_online():
    """
    Run migrations in 'online' mode.
    In this scenario we need to create an Engine
    and associate a connection with the context.
    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )
        with context.begin_transaction():
            context.run_migrations()

run_migrations_online()
