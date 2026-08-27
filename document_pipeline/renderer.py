"""
Sustainability MMKG-RAG: Document Pipeline — Page Renderer

Renders each PDF page as a high-quality PNG image for:
- Visual LLM processing
- Evidence viewer display
- Component crop extraction
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import fitz  # PyMuPDF

from document_pipeline.storage import StorageBackend, get_storage

logger = logging.getLogger(__name__)


class PageRenderResult:
    """Result of rendering a single page."""

    def __init__(
        self,
        page_number: int,
        storage_key: str,
        width: int,
        height: int,
        image_data: bytes,
    ):
        self.page_number = page_number
        self.storage_key = storage_key
        self.width = width
        self.height = height
        self.image_data = image_data


async def render_page(
    pdf_data: bytes,
    page_number: int,
    report_id: str,
    dpi: int = 200,
    storage: Optional[StorageBackend] = None,
) -> PageRenderResult:
    """
    Render a single PDF page as PNG.

    Args:
        pdf_data: Raw PDF bytes
        page_number: 0-indexed page number
        report_id: Report identifier for storage path
        dpi: Rendering resolution
        storage: Storage backend (uses default if None)

    Returns:
        PageRenderResult with image data and dimensions
    """
    if storage is None:
        storage = get_storage()

    doc = fitz.open(stream=pdf_data, filetype="pdf")
    try:
        if page_number >= doc.page_count:
            raise ValueError(f"Page {page_number} out of range (max: {doc.page_count - 1})")

        page = doc[page_number]
        zoom = dpi / 72.0
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        image_data = pix.tobytes("png")

        storage_key = f"pages/{report_id}/page_{page_number + 1:04d}.png"
        await storage.store_file(image_data, storage_key, content_type="image/png")

        result = PageRenderResult(
            page_number=page_number,
            storage_key=storage_key,
            width=pix.width,
            height=pix.height,
            image_data=image_data,
        )

        return result
    finally:
        doc.close()


async def render_all_pages(
    pdf_data: bytes,
    report_id: str,
    dpi: int = 200,
    storage: Optional[StorageBackend] = None,
    progress_callback=None,
) -> list[PageRenderResult]:
    """
    Render all pages of a PDF.

    Args:
        pdf_data: Raw PDF bytes
        report_id: Report identifier
        dpi: Rendering resolution
        storage: Storage backend
        progress_callback: Optional async callable(page_number, total_pages)

    Returns:
        List of PageRenderResult
    """
    if storage is None:
        storage = get_storage()

    doc = fitz.open(stream=pdf_data, filetype="pdf")
    total = doc.page_count
    doc.close()

    results = []
    for i in range(total):
        try:
            result = await render_page(pdf_data, i, report_id, dpi, storage)
            results.append(result)
            logger.info(f"Rendered page {i + 1}/{total} for report {report_id}")
        except Exception as e:
            logger.error(f"Failed to render page {i + 1}/{total}: {e}")
            # Continue with remaining pages — don't stop on one failure
            continue

        if progress_callback:
            await progress_callback(i + 1, total)

    return results


async def extract_component_crop(
    pdf_data: bytes,
    page_number: int,
    bbox: list[float],
    report_id: str,
    component_id: str,
    dpi: int = 200,
    storage: Optional[StorageBackend] = None,
) -> str:
    """
    Extract a cropped region from a PDF page.

    Used for extracting individual tables, figures, charts.

    Args:
        pdf_data: Raw PDF bytes
        page_number: 0-indexed page number
        bbox: [x0, y0, x1, y1] in PDF coordinates
        report_id: Report identifier
        component_id: Component identifier
        dpi: Rendering resolution
        storage: Storage backend

    Returns:
        Storage key for the cropped image
    """
    if storage is None:
        storage = get_storage()

    doc = fitz.open(stream=pdf_data, filetype="pdf")
    try:
        page = doc[page_number]
        zoom = dpi / 72.0
        mat = fitz.Matrix(zoom, zoom)

        clip = fitz.Rect(bbox)
        pix = page.get_pixmap(matrix=mat, clip=clip, alpha=False)
        image_data = pix.tobytes("png")

        storage_key = f"crops/{report_id}/page_{page_number + 1:04d}_{component_id}.png"
        await storage.store_file(image_data, storage_key, content_type="image/png")

        return storage_key
    finally:
        doc.close()
