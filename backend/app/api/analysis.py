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
from analytics.esg_scorer import ESGScorer
from analytics.regulatory import RegulatoryMapper

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


@router.get("/{report_id}/analysis/esg-score")
async def get_esg_score(report_id: str):
    """Compute ESG compliance score for a report."""
    graph = get_graph_backend()
    scorer = ESGScorer(graph)

    start = time.time()
    score_card = await scorer.compute_score(report_id)
    duration = time.time() - start

    return {
        "report_id": report_id,
        "analysis_type": "esg_score",
        "duration_seconds": duration,
        **score_card.to_dict(),
    }


@router.get("/{report_id}/analysis/regulatory")
async def get_regulatory_mapping(report_id: str):
    """Map report data against ESG reporting frameworks (GRI, SASB, TCFD, EU Taxonomy)."""
    graph = get_graph_backend()
    mapper = RegulatoryMapper(graph)

    start = time.time()
    frameworks = await mapper.map_frameworks(report_id)
    duration = time.time() - start

    return {
        "report_id": report_id,
        "analysis_type": "regulatory_mapping",
        "duration_seconds": duration,
        "frameworks": [f.to_dict() for f in frameworks],
    }


@router.get("/{report_id}/analysis/summary")
async def get_executive_summary(report_id: str, db: AsyncSession = Depends(get_db)):
    """Generate executive summary from extracted data."""
    graph = get_graph_backend()
    scorer = ESGScorer(graph)
    mapper = RegulatoryMapper(graph)

    # Get report info
    r = await db.execute(select(Report).where(Report.id == report_id))
    report = r.scalar_one_or_none()
    if not report:
        raise HTTPException(404, "Report not found")

    c = await db.execute(select(Company).where(Company.id == report.company_id))
    company = c.scalar_one_or_none()

    # Compute scores
    score_card = await scorer.compute_score(report_id)
    frameworks = await mapper.map_frameworks(report_id)

    # Get entity/KPI counts
    from mmkg.ontology import EntityType
    kpis = await graph.get_entities_by_type(EntityType.KPI.value, report_id)
    targets = await graph.get_entities_by_type(EntityType.TARGET.value, report_id)

    # Build summary
    summary_sections = []

    # Overview
    summary_sections.append({
        "title": "Report Overview",
        "content": f"{company.name if company else 'Unknown'} FY{report.fiscal_year or 'N/A'} sustainability report with {report.page_count or 0} pages analyzed. Extracted {report.entity_count or 0} entities, {len(kpis)} KPIs, and {len(targets)} targets.",
        "type": "info",
    })

    # ESG Score
    summary_sections.append({
        "title": "ESG Performance",
        "content": f"Overall ESG Grade: {score_card.grade} ({score_card.overall_score:.0f}/100). Environmental: {score_card.environmental.score:.0f}/100, Social: {score_card.social.score:.0f}/100, Governance: {score_card.governance.score:.0f}/100.",
        "type": "score",
    })

    # Framework coverage
    fw_summary = ", ".join([f"{f.framework_name}: {f.coverage_percent:.0f}%" for f in frameworks])
    summary_sections.append({
        "title": "Regulatory Framework Coverage",
        "content": fw_summary,
        "type": "compliance",
    })

    # Key Strengths
    if score_card.strengths:
        summary_sections.append({
            "title": "Key Strengths",
            "content": "; ".join(score_card.strengths[:5]),
            "type": "positive",
        })

    # Coverage Gaps
    if score_card.gaps:
        summary_sections.append({
            "title": "Coverage Gaps & Recommendations",
            "content": "; ".join(score_card.gaps[:5]),
            "type": "warning",
        })

    return {
        "report_id": report_id,
        "company_name": company.name if company else "Unknown",
        "fiscal_year": report.fiscal_year,
        "sections": summary_sections,
        "esg_grade": score_card.grade,
        "esg_score": round(score_card.overall_score, 1),
    }


@router.get("/{report_id}/export/csv")
async def export_csv(report_id: str):
    """Export all extracted KPIs and entities as CSV."""
    from fastapi.responses import StreamingResponse
    import io
    import csv

    graph = get_graph_backend()
    from mmkg.ontology import EntityType

    # Gather data
    rows = []
    for etype in [EntityType.KPI.value, EntityType.TARGET.value, EntityType.METRIC.value]:
        entities = await graph.get_entities_by_type(etype, report_id)
        for e in entities:
            rows.append({
                "entity_id": e.id,
                "type": etype,
                "name": e.name,
                "description": getattr(e, 'description', '') or '',
                "confidence": getattr(e, 'confidence', 0),
                "modality": getattr(e, 'modality', ''),
                "page_numbers": ",".join(str(p) for p in (e.page_numbers or [])),
            })

    # Build CSV
    output = io.StringIO()
    if rows:
        writer = csv.DictWriter(output, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    else:
        output.write("No data found for this report.\n")

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=report_{report_id[:8]}_export.csv"},
    )
