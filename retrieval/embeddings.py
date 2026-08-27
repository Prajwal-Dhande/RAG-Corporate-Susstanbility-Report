"""
Sustainability MMKG-RAG: Embedding Provider

Abstraction for text and visual embeddings.
Uses sentence-transformers for text, with CLIP extension for multimodal.

REFERENCE-INSPIRED: Multimodal indexing from KG4VD.
"""

from __future__ import annotations

import logging
import json
import numpy as np
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional

from backend.app.config import get_settings

logger = logging.getLogger(__name__)


class EmbeddingProvider(ABC):
    """Abstract embedding provider interface."""

    @abstractmethod
    def embed_text(self, texts: list[str]) -> np.ndarray:
        """Embed a batch of texts. Returns (N, D) array."""
        ...

    @abstractmethod
    def embed_query(self, query: str) -> np.ndarray:
        """Embed a single query. Returns (1, D) array."""
        ...

    @abstractmethod
    def dimension(self) -> int:
        """Return embedding dimension."""
        ...


class SentenceTransformerProvider(EmbeddingProvider):
    """sentence-transformers based embedding provider."""

    def __init__(self, model_name: Optional[str] = None):
        settings = get_settings()
        self.model_name = model_name or settings.embedding_model
        self._model = None

    @property
    def model(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer(self.model_name)
            logger.info(f"Loaded embedding model: {self.model_name}")
        return self._model

    def embed_text(self, texts: list[str]) -> np.ndarray:
        embeddings = self.model.encode(texts, show_progress_bar=False, normalize_embeddings=True)
        return np.array(embeddings)

    def embed_query(self, query: str) -> np.ndarray:
        return self.embed_text([query])

    def dimension(self) -> int:
        return self.model.get_sentence_embedding_dimension()


class EmbeddingIndex:
    """
    Simple vector index using numpy.
    Supports save/load for persistence.
    """

    def __init__(self, dimension: int):
        self.dimension = dimension
        self.embeddings: np.ndarray = np.zeros((0, dimension), dtype=np.float32)
        self.ids: list[str] = []
        self.metadata: list[dict] = []

    def add(self, embedding: np.ndarray, item_id: str, meta: Optional[dict] = None):
        """Add a single embedding."""
        if embedding.ndim == 1:
            embedding = embedding.reshape(1, -1)
        self.embeddings = np.vstack([self.embeddings, embedding]) if len(self.ids) > 0 else embedding
        self.ids.append(item_id)
        self.metadata.append(meta or {})

    def add_batch(self, embeddings: np.ndarray, ids: list[str], metas: Optional[list[dict]] = None):
        """Add a batch of embeddings."""
        if len(self.ids) > 0:
            self.embeddings = np.vstack([self.embeddings, embeddings])
        else:
            self.embeddings = embeddings.astype(np.float32)
        self.ids.extend(ids)
        self.metadata.extend(metas or [{} for _ in ids])

    def search(self, query_embedding: np.ndarray, top_k: int = 10) -> list[tuple[str, float, dict]]:
        """Search for nearest neighbors. Returns [(id, score, metadata)]."""
        if len(self.ids) == 0:
            return []

        if query_embedding.ndim == 1:
            query_embedding = query_embedding.reshape(1, -1)

        # Cosine similarity (embeddings are normalized)
        scores = np.dot(self.embeddings, query_embedding.T).flatten()
        top_indices = np.argsort(scores)[::-1][:top_k]

        results = []
        for idx in top_indices:
            if scores[idx] > 0:
                results.append((self.ids[idx], float(scores[idx]), self.metadata[idx]))

        return results

    def save(self, path: Path):
        """Save index to disk."""
        path.mkdir(parents=True, exist_ok=True)
        np.save(path / "embeddings.npy", self.embeddings)
        with open(path / "index_meta.json", "w") as f:
            json.dump({"ids": self.ids, "metadata": self.metadata}, f)

    def load(self, path: Path):
        """Load index from disk."""
        emb_path = path / "embeddings.npy"
        meta_path = path / "index_meta.json"
        if emb_path.exists() and meta_path.exists():
            self.embeddings = np.load(emb_path)
            with open(meta_path) as f:
                data = json.load(f)
                self.ids = data["ids"]
                self.metadata = data["metadata"]
            logger.info(f"Loaded index with {len(self.ids)} items")

    @property
    def size(self) -> int:
        return len(self.ids)


def get_embedding_provider() -> EmbeddingProvider:
    """Factory: return the configured embedding provider."""
    settings = get_settings()
    if settings.embedding_provider == "sentence_transformer":
        return SentenceTransformerProvider()
    raise ValueError(f"Unknown embedding provider: {settings.embedding_provider}")
