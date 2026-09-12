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
    limit: int = Query(400, le=1500),
):
    """Get the knowledge graph for a report."""
    graph = get_graph_backend()

    if entity_type:
        entities = await graph.get_entities_by_type(entity_type, report_id)
    else:
        entities = await graph.get_all_entities(report_id)

    relations = await graph.get_all_relations(report_id)

    # Deduplicate entities by name and type; union provenance across mentions
    canonical_entities = {}
    id_map = {}

    for e in entities:
        t = e.type.value if hasattr(e.type, "value") else str(e.type)
        key = f"{e.name.strip().lower()}|{t}"
        if key not in canonical_entities:
            canonical_entities[key] = e
            id_map[e.id] = e.id
        else:
            canon = canonical_entities[key]
            id_map[e.id] = canon.id
            # Fix Backend Mock Data Logic: Limit merged pages to 2 to prevent a KPI mapping to the entire document
            merged_pages = sorted(set(canon.page_numbers or []) | set(e.page_numbers or []))
            canon.page_numbers = merged_pages[:2]
            
            merged_components = dict.fromkeys((canon.source_component_ids or []) + (e.source_component_ids or []))
            canon.source_component_ids = list(merged_components)[:2]
            if (e.confidence or 0) > (canon.confidence or 0):
                canon.confidence = e.confidence
                if e.description:
                    canon.description = e.description

    unique_entities = list(canonical_entities.values())
    returned_entities = unique_entities[:limit]
    returned_ids = {e.id for e in returned_entities}

    entity_responses = [
        GraphEntityResponse(
            id=e.id,
            name=e.name,
            type=e.type.value if hasattr(e.type, "value") else str(e.type),
            modality=e.modality,
            description=e.description,
            confidence=e.confidence,
            page_numbers=e.page_numbers,
            source_component_ids=e.source_component_ids,
            properties=e.properties,
        )
        for e in returned_entities
    ]

    name_map = {e.id: e.name for e in unique_entities}

    unique_relations = []
    seen_relations = set()
    for r in relations:
        new_source = id_map.get(r.source_id, r.source_id)
        new_target = id_map.get(r.target_id, r.target_id)
        if new_source == new_target:
            continue
        if new_source not in returned_ids or new_target not in returned_ids:
            continue
        rel_val = r.relation.value if hasattr(r.relation, "value") else str(r.relation)
        rel_key = f"{new_source}_{rel_val}_{new_target}"
        if rel_key in seen_relations:
            continue
        seen_relations.add(rel_key)
        unique_relations.append(
            GraphRelationResponse(
                id=r.id,
                source_id=new_source,
                source_name=name_map.get(new_source, ""),
                relation=rel_val,
                target_id=new_target,
                target_name=name_map.get(new_target, ""),
                confidence=r.confidence,
                description=r.description,
            )
        )

    return GraphResponse(
        entities=entity_responses,
        relations=unique_relations,
        entity_count=len(unique_entities),
        relation_count=len(unique_relations),
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
