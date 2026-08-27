"""
Sustainability MMKG-RAG: Page API Routes
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from backend.app.schemas import PageResponse, PageDetailResponse, ComponentResponse
from mmkg.graph_builder import get_graph_backend
from mmkg.ontology import EntityType

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/{report_id}/pages", response_model=list[PageResponse])
async def get_report_pages(report_id: str):
    """Get all pages for a report."""
    graph = get_graph_backend()
    pages = await graph.get_entities_by_type(EntityType.PAGE.value, report_id)

    return [
        PageResponse(
            id=p.id,
            report_id=report_id,
            page_number=p.page_numbers[0] if p.page_numbers else 0,
            image_path=p.properties.get("image_uri"),
            component_count=p.properties.get("component_count", 0),
            entity_count=0,
            parsed=True,
        )
        for p in sorted(pages, key=lambda x: x.page_numbers[0] if x.page_numbers else 0)
    ]


@router.get("/{report_id}/pages/{page_number}", response_model=PageDetailResponse)
async def get_page_detail(report_id: str, page_number: int):
    """Get detailed page information including components."""
    graph = get_graph_backend()
    pages = await graph.get_entities_by_type(EntityType.PAGE.value, report_id)

    page = None
    for p in pages:
        if p.page_numbers and p.page_numbers[0] == page_number:
            page = p
            break

    if not page:
        raise HTTPException(404, f"Page {page_number} not found")

    return PageDetailResponse(
        id=page.id,
        report_id=report_id,
        page_number=page_number,
        image_path=page.properties.get("image_uri"),
        component_count=page.properties.get("component_count", 0),
        parsed=True,
    )
