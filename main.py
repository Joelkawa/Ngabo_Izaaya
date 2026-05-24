import os
import importlib
from collections import defaultdict
from fastapi import FastAPI, APIRouter, Request, Depends
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from alembic.config import Config
from alembic import command
from sqlalchemy.orm import Session
from core.database import engine, get_db
from apps.auth.models import UserModel
from apps.events.models import Event
from apps.family.models import Person, FamilyRelationship
from middleware import AuthMiddleware


import logging
logging.basicConfig(level=logging.DEBUG)


# The directory where all application folders are located
APPS_DIRECTORY = "apps"
API_PREFIX = "/api/v1"
HOME_STATS_FALLBACK = {
    "registered_members": 156,
    "generations_recorded": 8,
    "active_family_members": 12,
    "events_on_calendar": 5,
}

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


def count_tree_generations(db: Session) -> int:
    """Estimate the deepest generation chain from parent-child relationships."""
    parent_child_rows = db.query(
        FamilyRelationship.parent_id,
        FamilyRelationship.child_id
    ).filter(
        FamilyRelationship.relationship_type == "parent",
        FamilyRelationship.parent_id.isnot(None),
        FamilyRelationship.child_id.isnot(None),
    ).all()

    if not parent_child_rows:
        return 0

    children_by_parent = defaultdict(set)
    nodes = set()
    child_nodes = set()

    for parent_id, child_id in parent_child_rows:
        children_by_parent[parent_id].add(child_id)
        nodes.update([parent_id, child_id])
        child_nodes.add(child_id)

    roots = nodes - child_nodes or nodes
    memo = {}

    def get_depth(person_id: int, path: set[int]) -> int:
        if person_id in path:
            return 0

        if person_id in memo:
            return memo[person_id]

        children = children_by_parent.get(person_id, set())
        if not children:
            memo[person_id] = 1
            return 1

        depth = 1 + max(get_depth(child_id, path | {person_id}) for child_id in children)
        memo[person_id] = depth
        return depth

    return max(get_depth(root_id, set()) for root_id in roots)


def count_active_family_members(db: Session) -> int:
    relationship_rows = db.query(
        FamilyRelationship.parent_id,
        FamilyRelationship.child_id,
        FamilyRelationship.person1_id,
        FamilyRelationship.person2_id,
    ).all()

    active_member_ids = set()
    for row in relationship_rows:
        active_member_ids.update(member_id for member_id in row if member_id is not None)

    return len(active_member_ids)


def get_homepage_stats(db: Session) -> dict[str, int]:
    person_count = db.query(Person).count()
    user_count = db.query(UserModel).count()
    generation_count = count_tree_generations(db)
    active_member_count = count_active_family_members(db)
    event_count = db.query(Event).count()

    return {
        "registered_members": person_count or user_count or HOME_STATS_FALLBACK["registered_members"],
        "generations_recorded": generation_count or HOME_STATS_FALLBACK["generations_recorded"],
        "active_family_members": active_member_count or HOME_STATS_FALLBACK["active_family_members"],
        "events_on_calendar": event_count or HOME_STATS_FALLBACK["events_on_calendar"],
    }

# Initialize the main FastAPI application
app = FastAPI(
    title="Ngabo Izaaya Association",
    description="A modular and scalable website for the Ngabo Izaaya family association.",
    version="1.0.0",
)

# --- Static Files and Templates ---
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
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
app.add_middleware(AuthMiddleware)

# --- Dynamic App Discovery and Router Inclusion ---
apps_path = os.path.join(os.path.dirname(__file__), APPS_DIRECTORY)

print("Searching for apps in:", apps_path)

@app.get("/", response_class=HTMLResponse)
async def home(request: Request, db: Session = Depends(get_db)):
    homepage_stats = get_homepage_stats(db)
    return templates.TemplateResponse(
        request,
        "index.html",
        {
            "request": request,
            "active_page": "home",
            "homepage_stats": homepage_stats,
        }
    )

@app.get("/family", response_class=HTMLResponse)
async def family_page(request: Request):
    return templates.TemplateResponse(
        request,
        "family.html",
        {"request": request, "active_page": "family"}
    )

@app.get("/history", response_class=HTMLResponse)
async def history_page(request: Request):
    return templates.TemplateResponse(
        request,
        "history.html",
        {"request": request, "active_page": "history"}
    )

@app.get("/events", response_class=HTMLResponse)
async def events_page(request: Request):
    return templates.TemplateResponse(
        request,
        "events.html",
        {"request": request, "active_page": "events"}
    )

@app.get("/posts", response_class=HTMLResponse)
async def posts_page(request: Request):
    return templates.TemplateResponse(
        request,
        "posts.html",
        {"request": request, "active_page": "posts"}
    )

@app.get("/messages", response_class=HTMLResponse)
async def messages_page(request: Request):
    return templates.TemplateResponse(
        request,
        "messages.html",
        {"request": request, "active_page": "messages"}
    )

@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse(
        request,
        "login.html",
        {"request": request, "active_page": "login"}
    )

@app.get("/register", response_class=HTMLResponse)
async def register_page(request: Request):
    return templates.TemplateResponse(
        request,
        "register.html",
        {"request": request, "active_page": "register"}
    )


@app.get("/reset-password", response_class=HTMLResponse)
async def reset_password_page(request: Request):
    return templates.TemplateResponse(
        request,
        "reset_password.html",
        {"request": request, "active_page": "login"}
    )

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

    print("🚀 Starting Ngabo Izaaya Association...")
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
