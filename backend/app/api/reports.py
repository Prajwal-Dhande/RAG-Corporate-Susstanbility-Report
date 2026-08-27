"""
Sustainability MMKG-RAG: Report API Routes

Upload, process, and retrieve sustainability reports.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.config import get_settings
from backend.app.database import get_db
from backend.app.models import Company, Report, ProcessingStatus, ProcessingLog, Page
from backend.app.schemas import (
    CompanyCreate,
    CompanyResponse,
    ReportResponse,
    ReportStatusResponse,
    ReportUploadResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# In-memory tracking of background processing tasks
_processing_tasks: dict[str, dict] = {}


@router.post("/upload", response_model=ReportUploadResponse)
async def upload_report(
    file: UploadFile = File(...),
    company_name: str = Form(...),
    fiscal_year: Optional[int] = Form(None),
    report_type: str = Form("sustainability"),
    db: AsyncSession = Depends(get_db),
):
    """Upload a sustainability report PDF for processing."""
    settings = get_settings()

    # Validate file type
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted")

    # Read file
    file_data = await file.read()
    if len(file_data) > settings.pdf_max_size_mb * 1024 * 1024:
        raise HTTPException(400, f"File exceeds maximum size of {settings.pdf_max_size_mb} MB")

    # Get or create company
    result = await db.execute(select(Company).where(Company.name == company_name))
    company = result.scalar_one_or_none()
    if not company:
        company = Company(name=company_name)
        db.add(company)
        await db.flush()

    # Create report record
    report_id = str(uuid.uuid4())
    report = Report(
        id=report_id,
        company_id=company.id,
        title=file.filename or "Untitled Report",
        fiscal_year=fiscal_year,
        report_type=report_type,
        file_name=file.filename or "report.pdf",
        file_path="",  # Set after storage
        file_size_bytes=len(file_data),
        status=ProcessingStatus.PENDING,
    )
    db.add(report)
    await db.flush()

    # Store PDF and start processing in background
    async def process_in_background():
        from backend.app.services.pipeline import ProcessingPipeline
        from backend.app.database import async_session

        pipeline = ProcessingPipeline()

        async def update_progress(stage, progress, message):
            _processing_tasks[report_id] = {
                "stage": stage,
                "progress": progress,
                "message": message,
            }
            async with async_session() as session:
                result = await session.execute(select(Report).where(Report.id == report_id))
                report = result.scalar_one_or_none()
                if report:
                    report.processing_progress = progress
                    report.processing_message = f"{stage}: {message}"
                    # Map stage to status
                    stage_status_map = {
                        "ingestion": ProcessingStatus.UPLOADING,
                        "rendering": ProcessingStatus.RENDERING,
                        "parsing": ProcessingStatus.PARSING,
                        "extraction": ProcessingStatus.EXTRACTING,
                        "graph": ProcessingStatus.BUILDING_GRAPH,
                        "embedding": ProcessingStatus.EMBEDDING,
                        "complete": ProcessingStatus.COMPLETED,
                        "error": ProcessingStatus.FAILED,
                    }
                    report.status = stage_status_map.get(stage, report.status)
                    await session.commit()

        try:
            result = await pipeline.process_report(
                report_id, file_data, file.filename or "report.pdf",
                progress_callback=update_progress,
            )

            # Update final stats
            async with async_session() as session:
                r = await session.execute(select(Report).where(Report.id == report_id))
                report_obj = r.scalar_one_or_none()
                if report_obj:
                    report_obj.status = ProcessingStatus.COMPLETED
                    report_obj.entity_count = result.get("entity_count", 0)
                    report_obj.relation_count = result.get("relation_count", 0)
                    report_obj.kpi_count = result.get("kpi_count", 0)
                    report_obj.target_count = result.get("target_count", 0)
                    report_obj.page_count = result.get("page_count", 0)
                    report_obj.processing_progress = 1.0
                    report_obj.processing_message = "Processing complete"
                    report_obj.metadata_json = result.get("stages", {})
                    if result.get("errors"):
                        report_obj.error_message = "; ".join(result["errors"])
                    await session.commit()

        except Exception as e:
            logger.exception(f"Background processing failed for {report_id}")
            async with async_session() as session:
                r = await session.execute(select(Report).where(Report.id == report_id))
                report_obj = r.scalar_one_or_none()
                if report_obj:
                    report_obj.status = ProcessingStatus.FAILED
                    report_obj.error_message = str(e)
                    await session.commit()

    # Launch background task
    asyncio.create_task(process_in_background())

    return ReportUploadResponse(
        id=report_id,
        title=file.filename or "Untitled Report",
        file_name=file.filename or "report.pdf",
        status=ProcessingStatus.PENDING.value,
        message="Report uploaded. Processing started in background.",
    )


@router.get("", response_model=list[ReportResponse])
async def list_reports(db: AsyncSession = Depends(get_db)):
    """List all reports."""
    result = await db.execute(
        select(Report).order_by(Report.created_at.desc())
    )
    reports = result.scalars().all()

    responses = []
    for report in reports:
        # Get company name
        company_result = await db.execute(
            select(Company).where(Company.id == report.company_id)
        )
        company = company_result.scalar_one_or_none()

        responses.append(ReportResponse(
            id=report.id,
            company_id=report.company_id,
            company_name=company.name if company else None,
            title=report.title,
            fiscal_year=report.fiscal_year,
            report_type=report.report_type,
            file_name=report.file_name,
            file_size_bytes=report.file_size_bytes,
            page_count=report.page_count,
            version=report.version,
            status=report.status.value if isinstance(report.status, ProcessingStatus) else report.status,
            processing_progress=report.processing_progress,
            processing_message=report.processing_message,
            error_message=report.error_message,
            entity_count=report.entity_count or 0,
            relation_count=report.relation_count or 0,
            kpi_count=report.kpi_count or 0,
            target_count=report.target_count or 0,
            created_at=report.created_at,
            updated_at=report.updated_at,
        ))

    return responses


@router.get("/{report_id}", response_model=ReportResponse)
async def get_report(report_id: str, db: AsyncSession = Depends(get_db)):
    """Get report details."""
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(404, "Report not found")

    company_result = await db.execute(
        select(Company).where(Company.id == report.company_id)
    )
    company = company_result.scalar_one_or_none()

    return ReportResponse(
        id=report.id,
        company_id=report.company_id,
        company_name=company.name if company else None,
        title=report.title,
        fiscal_year=report.fiscal_year,
        report_type=report.report_type,
        file_name=report.file_name,
        file_size_bytes=report.file_size_bytes,
        page_count=report.page_count,
        version=report.version,
        status=report.status.value if isinstance(report.status, ProcessingStatus) else report.status,
        processing_progress=report.processing_progress,
        processing_message=report.processing_message,
        error_message=report.error_message,
        entity_count=report.entity_count or 0,
        relation_count=report.relation_count or 0,
        kpi_count=report.kpi_count or 0,
        target_count=report.target_count or 0,
        created_at=report.created_at,
        updated_at=report.updated_at,
    )


@router.get("/{report_id}/status", response_model=ReportStatusResponse)
async def get_report_status(report_id: str, db: AsyncSession = Depends(get_db)):
    """Get report processing status."""
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(404, "Report not found")

    # Get processing task info
    task_info = _processing_tasks.get(report_id, {})

    return ReportStatusResponse(
        id=report.id,
        status=report.status.value if isinstance(report.status, ProcessingStatus) else report.status,
        progress=report.processing_progress,
        message=report.processing_message or task_info.get("message"),
        stages=[],
    )
