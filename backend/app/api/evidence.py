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

    neighbors = await graph.get_entity_neighbors(entity_id, max_depth=2)

    # Aggregate evidence from neighbors
    snippets = []
    confs = []
    if entity.confidence:
        confs.append(entity.confidence)
    if entity.source_text:
        snippets.append(entity.source_text)
        
    for n in neighbors.get("entities", []):
        if n.id != entity_id:
            if n.confidence:
                confs.append(n.confidence)
            if hasattr(n, 'source_text') and n.source_text:
                snippets.append(n.source_text)
            if getattr(n, 'properties', {}).get('textSnippet'):
                snippets.append(n.properties['textSnippet'])
            
    avg_conf = sum(confs) / len(confs) if confs else 0.0
    combined_snippets = " | ".join(set(snippets)) if snippets else ""
    
    description = entity.description
    if not description and getattr(entity, 'properties', {}).get('category'):
        description = f"Category: {entity.properties['category']}"

    return {
        "entity_id": entity_id,
        "entity_name": entity.name,
        "entity_type": entity.type.value if hasattr(entity.type, 'value') else entity.type,
        "report_id": report_id,
        "description": description,
        "chunk_text": combined_snippets,
        "confidence": avg_conf,
        "provenance": {
            "page_numbers": entity.page_numbers,
            "source_component_ids": entity.source_component_ids,
            "extraction_method": getattr(entity, 'extraction_method', None) or "Information Extraction Pipeline",
            "model_name": getattr(entity, 'model_name', None) or "Llama-3.1 / Groq",
            "confidence": avg_conf,
            "source_text": combined_snippets,
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
