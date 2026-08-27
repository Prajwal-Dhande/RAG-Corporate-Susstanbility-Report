"""
Sustainability MMKG-RAG: Knowledge Graph API Routes
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from backend.app.schemas import GraphResponse, GraphEntityResponse, GraphRelationResponse
from mmkg.graph_builder import get_graph_backend
from mmkg.ontology import EntityType

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/{report_id}/graph", response_model=GraphResponse)
async def get_report_graph(
    report_id: str,
    entity_type: Optional[str] = Query(None, description="Filter by entity type"),
    limit: int = Query(200, le=1000),
):
    """Get the knowledge graph for a report."""
    graph = get_graph_backend()

    if entity_type:
        entities = await graph.get_entities_by_type(entity_type, report_id)
    else:
        entities = await graph.get_all_entities(report_id)

    relations = await graph.get_all_relations(report_id)

    entity_responses = [
        GraphEntityResponse(
            id=e.id,
            name=e.name,
            type=e.type.value if isinstance(e.type, EntityType) else e.type,
            modality=e.modality,
            description=e.description,
            confidence=e.confidence,
            page_numbers=e.page_numbers,
            source_component_ids=e.source_component_ids,
            properties=e.properties,
        )
        for e in entities[:limit]
    ]

    relation_responses = [
        GraphRelationResponse(
            id=r.id,
            source_id=r.source_id,
            source_name="",
            relation=r.relation.value if hasattr(r.relation, 'value') else str(r.relation),
            target_id=r.target_id,
            target_name="",
            confidence=r.confidence,
            description=r.description,
        )
        for r in relations[:limit * 2]
    ]

    return GraphResponse(
        entities=entity_responses,
        relations=relation_responses,
        entity_count=len(entities),
        relation_count=len(relations),
    )


@router.get("/{report_id}/graph/entity/{entity_id}")
async def get_graph_entity(report_id: str, entity_id: str):
    """Get entity details with neighbors."""
    graph = get_graph_backend()
    entity = await graph.get_entity(entity_id)

    if not entity:
        raise HTTPException(404, "Entity not found")

    neighbors = await graph.get_entity_neighbors(entity_id, max_depth=2)

    return {
        "entity": GraphEntityResponse(
            id=entity.id,
            name=entity.name,
            type=entity.type.value if isinstance(entity.type, EntityType) else entity.type,
            modality=entity.modality,
            description=entity.description,
            confidence=entity.confidence,
            page_numbers=entity.page_numbers,
            source_component_ids=entity.source_component_ids,
            properties=entity.properties,
        ),
        "neighbors": neighbors,
    }


@router.get("/{report_id}/kpis")
async def get_report_kpis(report_id: str):
    """Get all KPIs extracted from a report."""
    graph = get_graph_backend()
    kpis = await graph.get_entities_by_type(EntityType.KPI.value, report_id)

    results = []
    for kpi in kpis:
        # Get values from neighbors
        neighbors = await graph.get_entity_neighbors(kpi.id, max_depth=1)
        values = []
        for n in neighbors.get("entities", []):
            ntype = n.type if isinstance(n.type, str) else n.type.value
            if ntype in (EntityType.KPI_VALUE.value, EntityType.ACTUAL_VALUE.value):
                values.append({
                    "name": n.name,
                    "confidence": n.confidence,
                    "page_numbers": n.page_numbers,
                })

        results.append({
            "id": kpi.id,
            "name": kpi.name,
            "description": kpi.description,
            "confidence": kpi.confidence,
            "page_numbers": kpi.page_numbers,
            "values": values,
        })

    return {"kpis": results, "count": len(results)}


@router.get("/{report_id}/targets")
async def get_report_targets(report_id: str):
    """Get all targets extracted from a report."""
    graph = get_graph_backend()
    targets = await graph.get_entities_by_type(EntityType.TARGET.value, report_id)

    results = []
    for target in targets:
        neighbors = await graph.get_entity_neighbors(target.id, max_depth=2)
        related_kpi = None
        for n in neighbors.get("entities", []):
            ntype = n.type if isinstance(n.type, str) else n.type.value
            if ntype == EntityType.KPI.value:
                related_kpi = n.name
                break

        results.append({
            "id": target.id,
            "name": target.name,
            "description": target.description,
            "kpi_name": related_kpi,
            "confidence": target.confidence,
            "page_numbers": target.page_numbers,
            "properties": target.properties,
        })

    return {"targets": results, "count": len(results)}
