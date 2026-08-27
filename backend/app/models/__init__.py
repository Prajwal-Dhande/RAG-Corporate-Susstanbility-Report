"""
Sustainability MMKG-RAG: ORM Models

SQLAlchemy models for application metadata.
The knowledge graph lives in Neo4j/NetworkX — these models track
reports, processing jobs, pages, and analysis runs.
"""

from __future__ import annotations

import enum
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Enum, Float, ForeignKey, Integer, String, Text, JSON, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.database import Base, TimestampMixin, UUIDMixin


# ──────────────────────────────────────────────
# Enums
# ──────────────────────────────────────────────

class ProcessingStatus(str, enum.Enum):
    PENDING = "pending"
    UPLOADING = "uploading"
    RENDERING = "rendering"
    PARSING = "parsing"
    EXTRACTING = "extracting"
    BUILDING_GRAPH = "building_graph"
    EMBEDDING = "embedding"
    INDEXING = "indexing"
    ANALYZING = "analyzing"
    COMPLETED = "completed"
    FAILED = "failed"


class AnalysisType(str, enum.Enum):
    TARGET_PROGRESS = "target_progress"
    EMISSIONS = "emissions"
    ENERGY = "energy"
    CONSISTENCY = "consistency"
    TREND = "trend"
    LONGITUDINAL = "longitudinal"


# ──────────────────────────────────────────────
# Company
# ──────────────────────────────────────────────

class Company(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "companies"

    name: Mapped[str] = mapped_column(String(500), nullable=False)
    industry: Mapped[Optional[str]] = mapped_column(String(200))
    country: Mapped[Optional[str]] = mapped_column(String(100))
    description: Mapped[Optional[str]] = mapped_column(Text)

    reports: Mapped[list["Report"]] = relationship(back_populates="company", cascade="all, delete-orphan")


# ──────────────────────────────────────────────
# Report
# ──────────────────────────────────────────────

class Report(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "reports"

    company_id: Mapped[str] = mapped_column(String(36), ForeignKey("companies.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(1000), nullable=False)
    fiscal_year: Mapped[Optional[int]] = mapped_column(Integer)
    report_type: Mapped[Optional[str]] = mapped_column(String(200))  # ESG, CSR, Sustainability, Annual
    file_name: Mapped[str] = mapped_column(String(500), nullable=False)
    file_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(Integer)
    page_count: Mapped[Optional[int]] = mapped_column(Integer)
    version: Mapped[int] = mapped_column(Integer, default=1)

    # Processing
    status: Mapped[str] = mapped_column(
        Enum(ProcessingStatus), default=ProcessingStatus.PENDING
    )
    processing_progress: Mapped[Optional[float]] = mapped_column(Float, default=0.0)
    processing_message: Mapped[Optional[str]] = mapped_column(Text)
    error_message: Mapped[Optional[str]] = mapped_column(Text)

    # Metadata extracted during processing
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSON)

    # Stats (populated after processing)
    entity_count: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    relation_count: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    kpi_count: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    target_count: Mapped[Optional[int]] = mapped_column(Integer, default=0)

    company: Mapped["Company"] = relationship(back_populates="reports")
    pages: Mapped[list["Page"]] = relationship(back_populates="report", cascade="all, delete-orphan")
    processing_logs: Mapped[list["ProcessingLog"]] = relationship(back_populates="report", cascade="all, delete-orphan")
    analyses: Mapped[list["AnalysisRun"]] = relationship(back_populates="report", cascade="all, delete-orphan")


# ──────────────────────────────────────────────
# Page
# ──────────────────────────────────────────────

class Page(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "pages"

    report_id: Mapped[str] = mapped_column(String(36), ForeignKey("reports.id"), nullable=False)
    page_number: Mapped[int] = mapped_column(Integer, nullable=False)
    image_path: Mapped[Optional[str]] = mapped_column(String(1000))
    width: Mapped[Optional[int]] = mapped_column(Integer)
    height: Mapped[Optional[int]] = mapped_column(Integer)

    # Page-level content
    text_content: Mapped[Optional[str]] = mapped_column(Text)
    components_json: Mapped[Optional[dict]] = mapped_column(JSON)  # Canonical page JSON (Section 8)

    # Extraction status
    parsed: Mapped[bool] = mapped_column(Boolean, default=False)
    entities_extracted: Mapped[bool] = mapped_column(Boolean, default=False)
    embedded: Mapped[bool] = mapped_column(Boolean, default=False)

    # Stats
    component_count: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    entity_count: Mapped[Optional[int]] = mapped_column(Integer, default=0)

    report: Mapped["Report"] = relationship(back_populates="pages")


# ──────────────────────────────────────────────
# Processing Log
# ──────────────────────────────────────────────

class ProcessingLog(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "processing_logs"

    report_id: Mapped[str] = mapped_column(String(36), ForeignKey("reports.id"), nullable=False)
    stage: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)  # started, completed, failed
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float)
    model_name: Mapped[Optional[str]] = mapped_column(String(200))
    tokens_used: Mapped[Optional[int]] = mapped_column(Integer)
    entity_count: Mapped[Optional[int]] = mapped_column(Integer)
    relation_count: Mapped[Optional[int]] = mapped_column(Integer)
    page_count: Mapped[Optional[int]] = mapped_column(Integer)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    details_json: Mapped[Optional[dict]] = mapped_column(JSON)

    report: Mapped["Report"] = relationship(back_populates="processing_logs")


# ──────────────────────────────────────────────
# Analysis Run
# ──────────────────────────────────────────────

class AnalysisRun(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "analysis_runs"

    report_id: Mapped[str] = mapped_column(String(36), ForeignKey("reports.id"), nullable=False)
    analysis_type: Mapped[str] = mapped_column(Enum(AnalysisType), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    result_json: Mapped[Optional[dict]] = mapped_column(JSON)
    evidence_ids: Mapped[Optional[list]] = mapped_column(JSON)  # List of evidence IDs
    reasoning_path: Mapped[Optional[list]] = mapped_column(JSON)  # Reasoning trace
    confidence: Mapped[Optional[float]] = mapped_column(Float)
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float)
    error_message: Mapped[Optional[str]] = mapped_column(Text)

    report: Mapped["Report"] = relationship(back_populates="analyses")
