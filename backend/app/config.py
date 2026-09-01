"""
Sustainability MMKG-RAG: Application Configuration

Uses pydantic-settings to load configuration from environment variables.
All secrets come from .env — never hard-coded.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import List, Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- API Keys ---
    openai_api_key: str = ""

    # --- Database ---
    database_url: str = "sqlite+aiosqlite:///./data/app.db"

    # --- Neo4j ---
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_username: str = "neo4j"
    neo4j_password: str = ""

    # --- Redis ---
    redis_url: str = "redis://localhost:6379/0"

    # --- MinIO ---
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "sustainability-reports"
    minio_use_ssl: bool = False

    # --- Storage ---
    storage_backend: Literal["local", "minio"] = "local"
    local_storage_path: str = "./data"

    # --- Graph Backend ---
    graph_backend: Literal["networkx", "neo4j"] = "networkx"

    # --- Model Configuration ---
    vlm_provider: Literal["openai", "local", "mock", "groq"] = "openai"
    vlm_model: str = "gpt-4o-mini"
    vlm_temperature: float = 0.0
    vlm_max_tokens: int = 4096

    embedding_provider: str = "sentence_transformer"
    embedding_model: str = "all-MiniLM-L6-v2"

    reranker_model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"

    # --- Processing ---
    pdf_max_size_mb: int = 200
    page_render_dpi: int = 200
    max_extraction_retries: int = 3
    batch_size: int = 5

    # --- Retrieval Weights ---
    retrieval_alpha: float = 0.35  # semantic
    retrieval_beta: float = 0.25   # lexical
    retrieval_gamma: float = 0.25  # graph
    retrieval_delta: float = 0.10  # modality
    retrieval_epsilon: float = 0.05  # provenance

    # --- Confidence Weights ---
    confidence_extraction: float = 0.25
    confidence_grounding: float = 0.25
    confidence_agreement: float = 0.25
    confidence_retrieval: float = 0.25

    # --- Server ---
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    frontend_url: str = "http://localhost:3000"
    cors_origins: str = '["http://localhost:3000"]'

    # --- Logging ---
    log_level: str = "INFO"

    # --- Ablation Switches (Section 31) ---
    use_multimodal: bool = True
    use_graph: bool = True
    use_hybrid_retrieval: bool = True
    use_ppr: bool = True
    use_reasoning: bool = True
    use_consistency: bool = True
    use_temporal: bool = True

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins from JSON string."""
        try:
            return json.loads(self.cors_origins)
        except (json.JSONDecodeError, TypeError):
            return ["http://localhost:3000"]

    @property
    def storage_path(self) -> Path:
        """Resolved storage path."""
        return Path(self.local_storage_path).resolve()

    def ensure_directories(self) -> None:
        """Create required data directories."""
        base = self.storage_path
        for subdir in ["uploads", "pages", "crops", "graph", "embeddings", "logs"]:
            (base / subdir).mkdir(parents=True, exist_ok=True)


# Singleton
_settings: Settings | None = None


def get_settings() -> Settings:
    """Get application settings singleton."""
    global _settings
    if _settings is None:
        _settings = Settings()
        _settings.ensure_directories()
    return _settings
