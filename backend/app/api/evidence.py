"""
Sustainability MMKG-RAG: Evidence API Routes
"""

from __future__ import annotations

import logging
from fastapi import APIRouter, HTTPException

from mmkg.graph_builder import get_graph_backend

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/{report_id}/evidence/{entity_id}")
async def get_evidence(report_id: str, entity_id: str):
    """Get evidence for a specific entity, including source pages and provenance."""
    graph = get_graph_backend()
    entity = await graph.get_entity(entity_id)

    if not entity:
        raise HTTPException(404, "Entity not found")

    neighbors = await graph.get_entity_neighbors(entity_id, max_depth=1)

    return {
        "entity_id": entity_id,
        "entity_name": entity.name,
        "entity_type": entity.type.value if hasattr(entity.type, 'value') else entity.type,
        "report_id": report_id,
        "provenance": {
            "page_numbers": entity.page_numbers,
            "source_component_ids": entity.source_component_ids,
            "extraction_method": entity.extraction_method,
            "model_name": entity.model_name,
            "confidence": entity.confidence,
            "source_text": entity.source_text,
        },
        "related_entities": [
            {
                "id": n.id,
                "name": n.name,
                "type": n.type.value if hasattr(n.type, 'value') else n.type,
                "confidence": n.confidence,
            }
            for n in neighbors.get("entities", [])
            if n.id != entity_id
        ],
        "relations": neighbors.get("relations", []),
    }
