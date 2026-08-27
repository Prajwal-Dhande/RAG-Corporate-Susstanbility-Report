"""
Sustainability MMKG-RAG: Document Pipeline — PDF Ingestion

Handles PDF upload, validation, metadata extraction, and storage.
"""

from __future__ import annotations

import hashlib
import logging
import os
from pathlib import Path
from typing import Optional

import fitz  # PyMuPDF

from document_pipeline.storage import StorageBackend, get_storage

logger = logging.getLogger(__name__)

# Allowed MIME types
ALLOWED_TYPES = {
    "application/pdf",
}

# Magic bytes for PDF
PDF_MAGIC = b"%PDF"


class PDFValidationError(Exception):
    """Raised when PDF validation fails."""
    pass


class PDFMetadata:
    """Extracted PDF metadata."""

    def __init__(
        self,
        page_count: int,
        title: Optional[str] = None,
        author: Optional[str] = None,
        subject: Optional[str] = None,
        producer: Optional[str] = None,
        creator: Optional[str] = None,
        creation_date: Optional[str] = None,
        file_size_bytes: int = 0,
        sha256: str = "",
        is_encrypted: bool = False,
        has_text: bool = True,
    ):
        self.page_count = page_count
        self.title = title
        self.author = author
        self.subject = subject
        self.producer = producer
        self.creator = creator
        self.creation_date = creation_date
        self.file_size_bytes = file_size_bytes
        self.sha256 = sha256
        self.is_encrypted = is_encrypted
        self.has_text = has_text

    def to_dict(self) -> dict:
        return {
            "page_count": self.page_count,
            "title": self.title,
            "author": self.author,
            "subject": self.subject,
            "producer": self.producer,
            "creator": self.creator,
            "creation_date": self.creation_date,
            "file_size_bytes": self.file_size_bytes,
            "sha256": self.sha256,
            "is_encrypted": self.is_encrypted,
            "has_text": self.has_text,
        }


def validate_pdf(file_data: bytes, max_size_mb: int = 200) -> None:
    """
    Validate uploaded PDF file.

    Checks:
    - File size within limits
    - Magic bytes confirm PDF format
    - File is not corrupt (can be opened by PyMuPDF)
    - File is not encrypted (or can be opened without password)
    """
    # Size check
    size_mb = len(file_data) / (1024 * 1024)
    if size_mb > max_size_mb:
        raise PDFValidationError(
            f"File size ({size_mb:.1f} MB) exceeds maximum ({max_size_mb} MB)"
        )

    # Magic bytes
    if not file_data[:4].startswith(PDF_MAGIC):
        raise PDFValidationError("File does not appear to be a valid PDF")

    # Try opening with PyMuPDF
    try:
        doc = fitz.open(stream=file_data, filetype="pdf")
        if doc.is_encrypted:
            doc.close()
            raise PDFValidationError("Encrypted PDFs are not supported")
        if doc.page_count == 0:
            doc.close()
            raise PDFValidationError("PDF has no pages")
        doc.close()
    except fitz.fitz.FileDataError:
        raise PDFValidationError("PDF file is corrupt or cannot be read")
    except PDFValidationError:
        raise
    except Exception as e:
        raise PDFValidationError(f"Failed to validate PDF: {str(e)}")


def extract_metadata(file_data: bytes) -> PDFMetadata:
    """Extract metadata from a PDF file."""
    doc = fitz.open(stream=file_data, filetype="pdf")

    meta = doc.metadata or {}

    # Check if PDF has extractable text (vs scanned)
    has_text = False
    for page_num in range(min(5, doc.page_count)):
        page = doc[page_num]
        text = page.get_text().strip()
        if len(text) > 50:
            has_text = True
            break

    sha256 = hashlib.sha256(file_data).hexdigest()

    result = PDFMetadata(
        page_count=doc.page_count,
        title=meta.get("title") or None,
        author=meta.get("author") or None,
        subject=meta.get("subject") or None,
        producer=meta.get("producer") or None,
        creator=meta.get("creator") or None,
        creation_date=meta.get("creationDate") or None,
        file_size_bytes=len(file_data),
        sha256=sha256,
        is_encrypted=doc.is_encrypted,
        has_text=has_text,
    )

    doc.close()
    return result


async def ingest_pdf(
    file_data: bytes,
    file_name: str,
    report_id: str,
    storage: Optional[StorageBackend] = None,
    max_size_mb: int = 200,
) -> tuple[str, PDFMetadata]:
    """
    Full PDF ingestion pipeline.

    1. Validate the PDF
    2. Extract metadata
    3. Store the file
    4. Return storage path and metadata

    Returns:
        (storage_key, metadata)
    """
    if storage is None:
        storage = get_storage()

    # Step 1: Validate
    logger.info(f"Validating PDF: {file_name} ({len(file_data)} bytes)")
    validate_pdf(file_data, max_size_mb)

    # Step 2: Extract metadata
    metadata = extract_metadata(file_data)
    logger.info(
        f"PDF metadata: {metadata.page_count} pages, "
        f"has_text={metadata.has_text}, title={metadata.title}"
    )

    # Step 3: Store
    storage_key = f"uploads/{report_id}/{file_name}"
    await storage.store_file(file_data, storage_key, content_type="application/pdf")
    logger.info(f"Stored PDF at: {storage_key}")

    return storage_key, metadata
