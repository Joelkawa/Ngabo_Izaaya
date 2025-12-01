import os
import importlib
import asyncio
from fastapi import FastAPI, APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import os
from alembic.config import Config
from alembic import command
from core.database import Base, SessionLocal, engine
import sys
from fastapi import HTTPException, status
from apps.auth.services import get_current_admin


import logging
logging.basicConfig(level=logging.DEBUG)


# APScheduler imports
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import sessionmaker
from core.database import engine
from apps.auth.models import UserModel, Role

# The directory where all application folders are located
APPS_DIRECTORY = "apps"
API_PREFIX = "/api/v1"

# --- Database Migration Function ---
def run_migrations():
    """Programmatically runs Alembic migrations."""
    print("⏳ Running database migrations...")
    try:
        # Load Alembic configuration from the alembic.ini file
        alembic_cfg = Config("alembic.ini")
        # Run the 'upgrade head' command to apply all pending migrations
        command.upgrade(alembic_cfg, "head")
        print("✅ Migrations complete.")
    except Exception as e:
        print(f"❌ An error occurred during migrations: {e}")
        # Re-raise the exception to show the full traceback in the terminal
        raise e

# Initialize the main FastAPI application
app = FastAPI(
    title="Ngabo Izaaya Family App",
    description="A modular and scalable Family management application.",
    version="1.0.0",
)

# --- Static Files and Templates ---
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# --- CORS Middleware ---
origins = [
    "http://localhost",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    # Add more allowed hosts as needed
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Root Endpoint for Testing ---
@app.get("/", response_class=HTMLResponse)
async def serve_index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# --- Dynamic App Discovery and Router Inclusion ---
apps_path = os.path.join(os.path.dirname(__file__), APPS_DIRECTORY)

print("Searching for apps in:", apps_path)

if not os.path.isdir(apps_path):
    print(f"Error: The directory '{APPS_DIRECTORY}' was not found.")
else:
    for item_name in os.listdir(apps_path):
        app_dir = os.path.join(apps_path, item_name)

        if os.path.isdir(app_dir) and not item_name.startswith(('_', '.')):
            try:
                # Import the models from each app to ensure Alembic can detect them
                import_models_path = f'{APPS_DIRECTORY}.{item_name}.models'
                importlib.import_module(import_models_path)

                module_name = f"{APPS_DIRECTORY}.{item_name}.router"
                router_module = importlib.import_module(module_name)
                router_instance = getattr(router_module, "router", None)

                if router_instance and isinstance(router_instance, APIRouter):
                    app.include_router(
                        router_instance,
                        prefix=f"{API_PREFIX}/{item_name}",
                        tags=[item_name.capitalize()]
                    )
                    print(f"✅ Successfully loaded router from '{item_name}'.")
                else:
                    print(f"⚠️ Could not find a valid APIRouter named 'router' in '{module_name}'.")

            except ImportError as e:
                print(f"❌ Failed to import router for '{item_name}': {e}")
            except AttributeError as e:
                print(f"❌ Failed to find 'router' attribute in '{module_name}': {e}")

# --global scheduler variable
scheduler = None

# --- Startup Event Handler ---
@app.on_event("startup")
def startup_event():
    """Run database migrations and start scheduler on application startup."""

    print("🚀 Starting Ngabo Izaaya Family App...")
    global scheduler
    run_migrations()
    print("Application is ready to serve requests.")

# --- Shutdown Event Handler ---
@app.on_event("shutdown")
def shutdown_event():
    """Shutdown the scheduler when the application stops."""
    global scheduler
    if scheduler:
        scheduler.shutdown()
        print("✅ Scheduler shut down gracefully.")