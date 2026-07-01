from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import auth, calendar, domain, google

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Protected productivity workspace for computationally heavy students.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router, prefix="/api")
app.include_router(domain.router, prefix="/api")
app.include_router(calendar.router, prefix="/api")
app.include_router(google.router, prefix="/api")


@app.get("/api/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
