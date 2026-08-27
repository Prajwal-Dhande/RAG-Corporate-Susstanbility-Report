"""
Sustainability MMKG-RAG: Pydantic Schemas

Request/response schemas for all API endpoints.
Separate from ORM models to control API surface.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


# ──────────────────────────────────────────────
# Company
# ──────────────────────────────────────────────

class CompanyCreate(BaseModel):
    name: str
    industry: Optional[str] = None
    country: Optional[str] = None
    description: Optional[str] = None


class CompanyResponse(BaseModel):
    id: str
    name: str
    industry: Optional[str] = None
    country: Optional[str] = None
    description: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ──────────────────────────────────────────────
# Report
# ──────────────────────────────────────────────

class ReportUploadResponse(BaseModel):
    id: str
    title: str
    file_name: str
    status: str
    page_count: Optional[int] = None
    message: str


class ReportResponse(BaseModel):
    id: str
    company_id: str
    company_name: Optional[str] = None
    title: str
    fiscal_year: Optional[int] = None
    report_type: Optional[str] = None
    file_name: str
    file_size_bytes: Optional[int] = None
    page_count: Optional[int] = None
    version: int
    status: str
    processing_progress: Optional[float] = None
    processing_message: Optional[str] = None
    error_message: Optional[str] = None
    entity_count: Optional[int] = 0
    relation_count: Optional[int] = 0
    kpi_count: Optional[int] = 0
    target_count: Optional[int] = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReportStatusResponse(BaseModel):
    id: str
    status: str
    progress: Optional[float] = None
    message: Optional[str] = None
    stages: list[ProcessingStageStatus] = []


class ProcessingStageStatus(BaseModel):
    stage: str
    status: str  # pending, running, completed, failed
    duration_seconds: Optional[float] = None
    details: Optional[dict] = None


# Fix forward reference
ReportStatusResponse.model_rebuild()


# ──────────────────────────────────────────────
# Page
# ──────────────────────────────────────────────

class PageResponse(BaseModel):
    id: str
    report_id: str
    page_number: int
    image_path: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    text_content: Optional[str] = None
    component_count: Optional[int] = 0
    entity_count: Optional[int] = 0
    parsed: bool = False
    entities_extracted: bool = False

    model_config = {"from_attributes": True}


class PageDetailResponse(PageResponse):
    components: Optional[list[ComponentResponse]] = []


class ComponentResponse(BaseModel):
    id: str
    type: str  # paragraph, table, figure, chart
    bbox: Optional[list[float]] = None
    text: Optional[str] = None
    structured_data: Optional[dict] = None
    image_uri: Optional[str] = None
    caption: Optional[str] = None


# ──────────────────────────────────────────────
# Knowledge Graph
# ──────────────────────────────────────────────

class GraphEntityResponse(BaseModel):
    id: str
    name: str
    type: str
    modality: Optional[str] = None
    description: Optional[str] = None
    confidence: Optional[float] = None
    page_numbers: list[int] = []
    source_component_ids: list[str] = []
    properties: dict[str, Any] = {}


class GraphRelationResponse(BaseModel):
    id: str
    source_id: str
    source_name: str
    relation: str
    target_id: str
    target_name: str
    confidence: Optional[float] = None
    description: Optional[str] = None


class GraphResponse(BaseModel):
    entities: list[GraphEntityResponse] = []
    relations: list[GraphRelationResponse] = []
    entity_count: int = 0
    relation_count: int = 0


# ──────────────────────────────────────────────
# KPIs and Targets
# ──────────────────────────────────────────────

class KPIResponse(BaseModel):
    id: str
    name: str
    category: Optional[str] = None  # emissions, energy, water, waste
    description: Optional[str] = None
    values: list[KPIValueResponse] = []
    unit: Optional[str] = None
    source_pages: list[int] = []
    confidence: Optional[float] = None


class KPIValueResponse(BaseModel):
    value: Optional[float] = None
    raw_value: Optional[str] = None
    unit: Optional[str] = None
    normalized_value: Optional[float] = None
    normalized_unit: Optional[str] = None
    fiscal_year: Optional[int] = None
    period: Optional[str] = None
    source_page: Optional[int] = None
    confidence: Optional[float] = None


class TargetResponse(BaseModel):
    id: str
    kpi_name: str
    target_value: Optional[float] = None
    target_unit: Optional[str] = None
    target_description: Optional[str] = None
    baseline_year: Optional[int] = None
    baseline_value: Optional[float] = None
    deadline_year: Optional[int] = None
    current_value: Optional[float] = None
    current_year: Optional[int] = None
    gap: Optional[float] = None
    progress_percent: Optional[float] = None
    status: Optional[str] = None  # on_track, behind, ahead, achieved, unknown
    source_pages: list[int] = []
    confidence: Optional[float] = None
    reasoning_path: list[str] = []


# ──────────────────────────────────────────────
# Analysis
# ──────────────────────────────────────────────

class AnalysisRequest(BaseModel):
    analysis_type: str = "target_progress"
    parameters: dict[str, Any] = {}


class AnalysisResponse(BaseModel):
    id: str
    report_id: str
    analysis_type: str
    status: str
    result: Optional[dict[str, Any]] = None
    evidence: list[EvidenceResponse] = []
    reasoning_path: list[str] = []
    confidence: Optional[float] = None
    duration_seconds: Optional[float] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ConsistencyResult(BaseModel):
    kpi_name: str
    sources: list[SourceEvidence] = []
    status: str  # CONSISTENT, MINOR_VARIANCE, CONFLICTING, INSUFFICIENT_EVIDENCE, UNVERIFIED
    variance: Optional[float] = None
    explanation: Optional[str] = None


class SourceEvidence(BaseModel):
    modality: str  # text, table, chart, figure
    value: Optional[str] = None
    page_number: Optional[int] = None
    component_id: Optional[str] = None
    confidence: Optional[float] = None


# ──────────────────────────────────────────────
# Evidence
# ──────────────────────────────────────────────

class EvidenceResponse(BaseModel):
    id: str
    report_id: str
    page_number: int
    component_id: Optional[str] = None
    component_type: Optional[str] = None
    bbox: Optional[list[float]] = None
    source_text: Optional[str] = None
    source_image_uri: Optional[str] = None
    extraction_method: Optional[str] = None
    model_name: Optional[str] = None
    confidence: Optional[float] = None
    related_entities: list[str] = []  # Entity IDs


# ──────────────────────────────────────────────
# Trends
# ──────────────────────────────────────────────

class TrendResponse(BaseModel):
    kpi_name: str
    data_points: list[TrendDataPoint] = []
    trend_direction: Optional[str] = None  # increasing, decreasing, stable, volatile
    year_over_year_changes: list[YoYChange] = []


class TrendDataPoint(BaseModel):
    year: int
    value: Optional[float] = None
    unit: Optional[str] = None


class YoYChange(BaseModel):
    from_year: int
    to_year: int
    absolute_change: Optional[float] = None
    percent_change: Optional[float] = None


# ──────────────────────────────────────────────
# Health
# ──────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    version: str
    database: str
    graph_backend: str
    storage_backend: str
