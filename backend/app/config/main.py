from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config.settings import get_settings
from app.controller.chat_controller import router as chat_router
from app.controller.claude_controller import router as claude_router
from app.controller.dynamics_controller import router as dynamics_router
from app.controller.geo_controller import router as geo_router
from app.controller.meeting_controller import router as meeting_router
from app.controller.replicate_controller import router as replicate_router
from app.controller.system_controller import router as system_router

settings = get_settings()

app = FastAPI(
    title="Claude Impact Lab Backend",
    version="0.1.0",
    root_path="/api",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.parsed_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(system_router)
app.include_router(claude_router)
app.include_router(chat_router)
app.include_router(dynamics_router)
app.include_router(meeting_router)
app.include_router(replicate_router)
app.include_router(geo_router)
