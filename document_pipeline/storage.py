"""
Sustainability MMKG-RAG: Document Pipeline — Storage Abstraction

Provides a unified interface for storing/retrieving files.
Supports local filesystem (dev) and MinIO/S3 (production).
"""

from __future__ import annotations

import os
import shutil
import uuid
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional

from backend.app.config import get_settings


class StorageBackend(ABC):
    """Abstract storage backend."""

    @abstractmethod
    async def store_file(self, file_data: bytes, key: str, content_type: str = "application/octet-stream") -> str:
        """Store a file and return its URI/path."""
        ...

    @abstractmethod
    async def get_file(self, key: str) -> bytes:
        """Retrieve file data by key."""
        ...

    @abstractmethod
    async def get_url(self, key: str) -> str:
        """Get a URL/path to access the file."""
        ...

    @abstractmethod
    async def delete_file(self, key: str) -> bool:
        """Delete a file by key."""
        ...

    @abstractmethod
    async def file_exists(self, key: str) -> bool:
        """Check if a file exists."""
        ...

    def generate_key(self, prefix: str, filename: str, extension: Optional[str] = None) -> str:
        """Generate a unique storage key."""
        if extension is None:
            extension = Path(filename).suffix
        unique_id = str(uuid.uuid4())[:8]
        safe_name = Path(filename).stem.replace(" ", "_")[:50]
        return f"{prefix}/{safe_name}_{unique_id}{extension}"


class LocalStorage(StorageBackend):
    """Local filesystem storage backend for development."""

    def __init__(self, base_path: Optional[str] = None):
        settings = get_settings()
        self.base_path = Path(base_path or settings.local_storage_path).resolve()
        self.base_path.mkdir(parents=True, exist_ok=True)

    async def store_file(self, file_data: bytes, key: str, content_type: str = "application/octet-stream") -> str:
        file_path = self.base_path / key
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(file_data)
        return str(file_path)

    async def get_file(self, key: str) -> bytes:
        file_path = self.base_path / key
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {key}")
        return file_path.read_bytes()

    async def get_url(self, key: str) -> str:
        return f"/storage/{key}"

    async def delete_file(self, key: str) -> bool:
        file_path = self.base_path / key
        if file_path.exists():
            file_path.unlink()
            return True
        return False

    async def file_exists(self, key: str) -> bool:
        return (self.base_path / key).exists()

    def get_local_path(self, key: str) -> Path:
        """Get the actual local filesystem path (dev convenience)."""
        return self.base_path / key


class MinIOStorage(StorageBackend):
    """MinIO/S3-compatible object storage backend."""

    def __init__(self):
        settings = get_settings()
        try:
            from minio import Minio
            self.client = Minio(
                settings.minio_endpoint,
                access_key=settings.minio_access_key,
                secret_key=settings.minio_secret_key,
                secure=settings.minio_use_ssl,
            )
            self.bucket = settings.minio_bucket
            self._ensure_bucket()
        except ImportError:
            raise RuntimeError("minio package required for MinIO storage backend")

    def _ensure_bucket(self):
        if not self.client.bucket_exists(self.bucket):
            self.client.make_bucket(self.bucket)

    async def store_file(self, file_data: bytes, key: str, content_type: str = "application/octet-stream") -> str:
        import io
        data = io.BytesIO(file_data)
        self.client.put_object(
            self.bucket, key, data, length=len(file_data),
            content_type=content_type,
        )
        return f"s3://{self.bucket}/{key}"

    async def get_file(self, key: str) -> bytes:
        response = self.client.get_object(self.bucket, key)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    async def get_url(self, key: str) -> str:
        return self.client.presigned_get_object(self.bucket, key)

    async def delete_file(self, key: str) -> bool:
        try:
            self.client.remove_object(self.bucket, key)
            return True
        except Exception:
            return False

    async def file_exists(self, key: str) -> bool:
        try:
            self.client.stat_object(self.bucket, key)
            return True
        except Exception:
            return False


def get_storage() -> StorageBackend:
    """Factory: return the configured storage backend."""
    settings = get_settings()
    if settings.storage_backend == "minio":
        return MinIOStorage()
    return LocalStorage()
