"""
Sustainability MMKG-RAG: FastAPI Application

Main entry point for the backend API server.
Registers all routes, CORS, lifespan events, and OpenAPI metadata.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.app.config import get_settings
from backend.app.database import init_db

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown."""
    settings = get_settings()
    logger.info("=" * 60)
    logger.info("Sustainability MMKG-RAG starting up...")
    logger.info(f"  Storage backend: {settings.storage_backend}")
    logger.info(f"  Graph backend: {settings.graph_backend}")
    logger.info(f"  VLM provider: {settings.vlm_provider}")
    logger.info(f"  Embedding: {settings.embedding_model}")
    logger.info("=" * 60)

    # Initialize database
    await init_db()
    logger.info("Database initialized")

    # Ensure data directories exist
    settings.ensure_directories()

    yield

    logger.info("Sustainability MMKG-RAG shutting down")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title="Sustainability MMKG-RAG API",
        description=(
            "Knowledge Graph-Powered Multimodal RAG for "
            "Corporate Sustainability Report Analysis"
        ),
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # CORS - Allow all for simple working demo
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Mount static storage for local file serving
    from pathlib import Path
    storage_path = Path(settings.local_storage_path)
    if storage_path.exists():
        app.mount("/storage", StaticFiles(directory=str(storage_path)), name="storage")

    # Register API routes
    from backend.app.api.reports import router as reports_router
    from backend.app.api.pages import router as pages_router
    from backend.app.api.graph import router as graph_router
    from backend.app.api.analysis import router as analysis_router
    from backend.app.api.evidence import router as evidence_router

    app.include_router(reports_router, prefix="/api/reports", tags=["Reports"])
    app.include_router(pages_router, prefix="/api/reports", tags=["Pages"])
    app.include_router(graph_router, prefix="/api/reports", tags=["Knowledge Graph"])
    app.include_router(analysis_router, prefix="/api/reports", tags=["Analysis"])
    app.include_router(evidence_router, prefix="/api/reports", tags=["Evidence"])

    @app.get("/health", tags=["System"])
    async def health_check():
        return {
            "status": "healthy",
            "version": "0.1.0",
            "database": settings.database_url.split("://")[0],
            "graph_backend": settings.graph_backend,
            "storage_backend": settings.storage_backend,
        }

    return app


app = create_app()
