"""
Sustainability MMKG-RAG: Provenance Model

Every important graph fact retains full provenance for evidence traceability.

Mandatory provenance fields per Section 7:
  report_id, report_version, page_id, page_number, component_id,
  component_type, bounding_box, source_text, source_image_uri,
  extraction_method, model_name, confidence, timestamp
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional


@dataclass
class Provenance:
    """Full provenance record for an extracted fact."""
    report_id: str
    report_version: int = 1
    page_id: str = ""
    page_number: int = -1
    component_id: str = ""
    component_type: str = ""  # paragraph, table, figure, chart
    bounding_box: list[float] = field(default_factory=list)
    source_text: str = ""
    source_image_uri: str = ""
    extraction_method: str = ""  # vlm_extraction, rule_based, ocr
    model_name: str = ""
    confidence: float = 0.0
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict:
        return {
            "report_id": self.report_id,
            "report_version": self.report_version,
            "page_id": self.page_id,
            "page_number": self.page_number,
            "component_id": self.component_id,
            "component_type": self.component_type,
            "bounding_box": self.bounding_box,
            "source_text": self.source_text,
            "source_image_uri": self.source_image_uri,
            "extraction_method": self.extraction_method,
            "model_name": self.model_name,
            "confidence": self.confidence,
            "timestamp": self.timestamp,
        }

    @staticmethod
    def from_dict(data: dict) -> "Provenance":
        return Provenance(**{k: v for k, v in data.items() if k in Provenance.__dataclass_fields__})


@dataclass
class ConfidenceScore:
    """
    Composite confidence score built from multiple signals.

    confidence = w1*extraction + w2*grounding + w3*agreement + w4*retrieval

    Never purely LLM-generated (Section 19).
    """
    extraction_confidence: float = 0.0
    grounding_score: float = 0.0
    source_agreement: float = 0.0
    retrieval_score: float = 0.0

    # Configurable weights
    w_extraction: float = 0.25
    w_grounding: float = 0.25
    w_agreement: float = 0.25
    w_retrieval: float = 0.25

    @property
    def composite(self) -> float:
        """Compute the composite confidence score."""
        return (
            self.w_extraction * self.extraction_confidence
            + self.w_grounding * self.grounding_score
            + self.w_agreement * self.source_agreement
            + self.w_retrieval * self.retrieval_score
        )

    def to_dict(self) -> dict:
        return {
            "extraction_confidence": self.extraction_confidence,
            "grounding_score": self.grounding_score,
            "source_agreement": self.source_agreement,
            "retrieval_score": self.retrieval_score,
            "composite": self.composite,
            "weights": {
                "extraction": self.w_extraction,
                "grounding": self.w_grounding,
                "agreement": self.w_agreement,
                "retrieval": self.w_retrieval,
            },
        }


def compute_grounding_score(
    entity_component_ids: list[str],
    page_component_ids: set[str],
) -> float:
    """
    Compute grounding score: what fraction of referenced components exist?
    """
    if not entity_component_ids:
        return 0.0
    valid = sum(1 for c in entity_component_ids if c in page_component_ids)
    return valid / len(entity_component_ids)


def compute_source_agreement(
    values: list[float],
    tolerance: float = 0.05,
) -> float:
    """
    Compute source agreement: do values from different modalities agree?

    Returns 1.0 for perfect agreement, decreasing for larger variance.
    """
    if len(values) < 2:
        return 1.0  # Single source = no disagreement

    mean_val = sum(values) / len(values)
    if mean_val == 0:
        return 1.0 if all(v == 0 for v in values) else 0.0

    max_deviation = max(abs(v - mean_val) / abs(mean_val) for v in values)
    if max_deviation <= tolerance:
        return 1.0
    elif max_deviation <= tolerance * 3:
        return 0.7
    elif max_deviation <= tolerance * 10:
        return 0.3
    else:
        return 0.0
