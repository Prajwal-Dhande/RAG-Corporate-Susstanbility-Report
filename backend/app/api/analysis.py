"""
Sustainability MMKG-RAG: Analysis API Routes
"""

from __future__ import annotations

import logging
import time
from typing import List

from fastapi import APIRouter, HTTPException, Body, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.app.database import get_db
from backend.app.models import Report, Company
from mmkg.graph_builder import get_graph_backend
from reasoning.engine import ReasoningEngine
from reasoning.consistency import ConsistencyChecker
from analytics.benchmarking import BenchmarkAnalyzer
from analytics.longitudinal import LongitudinalAnalyzer

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


@router.get("/{report_id}/analysis/consistency")
async def analyze_consistency(report_id: str):
    """Check cross-modal consistency of reported data."""
    graph = get_graph_backend()
    checker = ConsistencyChecker(graph)

    start = time.time()
    results = await checker.check_report_consistency(report_id)
    duration = time.time() - start

    return {
        "report_id": report_id,
        "analysis_type": "consistency",
        "duration_seconds": duration,
        "results": [r.to_dict() for r in results],
    }


@router.post("/analysis/benchmark")
async def analyze_benchmark(report_ids: List[str] = Body(...), db: AsyncSession = Depends(get_db)):
    """Cross-company benchmarking for specific reports."""
    graph = get_graph_backend()
    analyzer = BenchmarkAnalyzer(graph)

    # Resolve company names for the reports
    report_info = {}
    for rid in report_ids:
        r = await db.execute(select(Report).where(Report.id == rid))
        report = r.scalar_one_or_none()
        if report:
            c = await db.execute(select(Company).where(Company.id == report.company_id))
            company = c.scalar_one_or_none()
            report_info[rid] = company.name if company else f"Report {rid[:8]}"

    # Fetch benchmark data (assuming target_year=2024 for simplicity, or we can make it dynamic)
    start = time.time()
    results = await analyzer.compare_emissions(report_ids, target_year=2024)
    duration = time.time() - start

    # Map report_ids to company names in results
    for res in results:
        mapped_companies = {}
        for rid, data in res.companies.items():
            comp_name = report_info.get(rid, rid)
            mapped_companies[comp_name] = data
        res.companies = mapped_companies

    return {
        "analysis_type": "benchmark",
        "duration_seconds": duration,
        "results": [r.to_dict() for r in results],
    }


@router.post("/analysis/longitudinal")
async def analyze_longitudinal(company_id: str = Body(embed=True), db: AsyncSession = Depends(get_db)):
    """Multi-year longitudinal analysis for a specific company."""
    graph = get_graph_backend()
    analyzer = LongitudinalAnalyzer(graph)

    c = await db.execute(select(Company).where(Company.id == company_id))
    company = c.scalar_one_or_none()
    if not company:
        raise HTTPException(404, "Company not found")

    r = await db.execute(select(Report).where(Report.company_id == company_id))
    reports = r.scalars().all()
    
    report_dicts = [{"id": rep.id, "fiscal_year": rep.fiscal_year} for rep in reports]

    start = time.time()
    results = await analyzer.analyze_company_trends(company.name, report_dicts)
    duration = time.time() - start

    return {
        "company_id": company.id,
        "company_name": company.name,
        "analysis_type": "longitudinal",
        "duration_seconds": duration,
        "results": [r.to_dict() for r in results],
    }
