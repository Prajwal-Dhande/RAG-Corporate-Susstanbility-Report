"""
Sustainability MMKG-RAG: Analysis API Routes
"""

from __future__ import annotations

import logging
import time

from fastapi import APIRouter, HTTPException

from mmkg.graph_builder import get_graph_backend
from reasoning.engine import ReasoningEngine

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/{report_id}/analysis/target-progress")
async def analyze_target_progress(report_id: str, kpi_name: str = None):
    """Run target-vs-actual progress analysis."""
    graph = get_graph_backend()
    engine = ReasoningEngine(graph)

    start = time.time()
    results = await engine.analyze_target_progress(report_id, kpi_name)
    duration = time.time() - start

    return {
        "report_id": report_id,
        "analysis_type": "target_progress",
        "duration_seconds": duration,
        "results": [r.to_dict() for r in results],
    }


@router.post("/{report_id}/analysis/emissions")
async def analyze_emissions(report_id: str):
    """Analyze emissions data from the report."""
    graph = get_graph_backend()
    engine = ReasoningEngine(graph)

    start = time.time()
    result = await engine.analyze_emissions(report_id)
    duration = time.time() - start

    return {
        "report_id": report_id,
        "analysis_type": "emissions",
        "duration_seconds": duration,
        "result": result.to_dict(),
    }


@router.post("/{report_id}/analysis/consistency")
async def analyze_consistency(report_id: str):
    """Check cross-modal consistency of reported data."""
    # TODO: Implement consistency checking
    return {
        "report_id": report_id,
        "analysis_type": "consistency",
        "status": "not_implemented",
        "message": "Cross-modal consistency checking is under development",
    }


@router.post("/{report_id}/analysis/energy")
async def analyze_energy(report_id: str):
    """Analyze energy consumption data."""
    graph = get_graph_backend()
    all_entities = await graph.get_all_entities(report_id)

    energy_entities = [
        e for e in all_entities
        if any(kw in e.name.lower() for kw in ["energy", "electricity", "power", "renewable", "solar", "wind", "mwh", "gwh"])
    ]

    return {
        "report_id": report_id,
        "analysis_type": "energy",
        "entities": [
            {
                "id": e.id,
                "name": e.name,
                "description": e.description,
                "confidence": e.confidence,
                "page_numbers": e.page_numbers,
            }
            for e in energy_entities
        ],
        "count": len(energy_entities),
    }
