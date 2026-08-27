"""
Sustainability MMKG-RAG: Cross-Modal Consistency Checking

Compares information from Text, Table, Chart, Figure, Caption for the same KPI/claim.
Detects CONSISTENT / MINOR_VARIANCE / CONFLICTING / INSUFFICIENT_EVIDENCE / UNVERIFIED.

PROJECT-SPECIFIC EXTENSION — major research feature.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Optional

from mmkg.graph_builder import GraphBackend
from mmkg.ontology import ConsistencyStatus, EntityType

logger = logging.getLogger(__name__)


@dataclass
class SourceValue:
    """A value from a specific source modality."""
    modality: str  # text, table, chart, figure, caption
    value: Optional[float] = None
    raw_text: str = ""
    page_number: int = -1
    component_id: str = ""
    confidence: float = 0.0


@dataclass
class ConsistencyCheckResult:
    """Result of consistency checking for a single KPI."""
    kpi_name: str
    kpi_id: str = ""
    sources: list[SourceValue] = field(default_factory=list)
    status: ConsistencyStatus = ConsistencyStatus.UNVERIFIED
    variance: Optional[float] = None
    max_deviation: Optional[float] = None
    explanation: str = ""
    evidence_pages: list[int] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "kpi_name": self.kpi_name,
            "kpi_id": self.kpi_id,
            "sources": [
                {
                    "modality": s.modality,
                    "value": s.value,
                    "raw_text": s.raw_text,
                    "page_number": s.page_number,
                    "component_id": s.component_id,
                    "confidence": s.confidence,
                }
                for s in self.sources
            ],
            "status": self.status.value,
            "variance": self.variance,
            "max_deviation": self.max_deviation,
            "explanation": self.explanation,
            "evidence_pages": self.evidence_pages,
        }


class ConsistencyChecker:
    """
    Checks cross-modal consistency of reported sustainability data.

    For each KPI, collects values from all modalities (text, table, chart)
    and compares them to detect conflicts.
    """

    # Relative tolerance for "minor variance" vs "conflicting"
    MINOR_VARIANCE_THRESHOLD = 0.05  # 5%
    CONFLICT_THRESHOLD = 0.10  # 10%

    def __init__(self, graph: GraphBackend):
        self.graph = graph

    async def check_report_consistency(
        self,
        report_id: str,
    ) -> list[ConsistencyCheckResult]:
        """
        Run consistency checks across all KPIs in a report.

        Returns list of ConsistencyCheckResult for each KPI.
        """
        results = []

        # Get all KPIs
        kpis = await self.graph.get_entities_by_type(EntityType.KPI.value, report_id)

        for kpi in kpis:
            result = await self._check_kpi_consistency(kpi, report_id)
            results.append(result)

        # Summary
        statuses = [r.status.value for r in results]
        logger.info(
            f"Consistency check for {report_id}: "
            f"{statuses.count('CONSISTENT')} consistent, "
            f"{statuses.count('MINOR_VARIANCE')} minor variance, "
            f"{statuses.count('CONFLICTING')} conflicting, "
            f"{statuses.count('INSUFFICIENT_EVIDENCE')} insufficient"
        )

        return results

    async def _check_kpi_consistency(
        self,
        kpi,
        report_id: str,
    ) -> ConsistencyCheckResult:
        """Check consistency for a single KPI across modalities."""
        neighbors = await self.graph.get_entity_neighbors(kpi.id, max_depth=1)

        # Collect values from different modalities
        sources: list[SourceValue] = []
        for entity in neighbors.get("entities", []):
            etype = entity.type if isinstance(entity.type, str) else entity.type.value
            if etype not in (EntityType.KPI_VALUE.value, EntityType.ACTUAL_VALUE.value):
                continue

            value = self._extract_numeric(entity.name, entity.properties)
            if value is not None:
                sources.append(SourceValue(
                    modality=entity.modality or "text",
                    value=value,
                    raw_text=entity.name,
                    page_number=entity.page_numbers[0] if entity.page_numbers else -1,
                    component_id=entity.source_component_ids[0] if entity.source_component_ids else "",
                    confidence=entity.confidence,
                ))

        evidence_pages = sorted(set(
            s.page_number for s in sources if s.page_number >= 0
        ))

        result = ConsistencyCheckResult(
            kpi_name=kpi.name,
            kpi_id=kpi.id,
            sources=sources,
            evidence_pages=evidence_pages,
        )

        if len(sources) < 2:
            result.status = ConsistencyStatus.INSUFFICIENT_EVIDENCE
            result.explanation = (
                f"Only {len(sources)} source(s) found. "
                "Need at least 2 sources from different modalities for comparison."
            )
            return result

        # Check if we have multiple modalities
        modalities = set(s.modality for s in sources)
        if len(modalities) < 2:
            result.status = ConsistencyStatus.UNVERIFIED
            result.explanation = (
                f"All {len(sources)} values come from the same modality ({modalities.pop()}). "
                "Cross-modal verification not possible."
            )
            return result

        # Compare values
        values = [s.value for s in sources if s.value is not None]
        if not values:
            result.status = ConsistencyStatus.INSUFFICIENT_EVIDENCE
            result.explanation = "No numeric values extracted from sources."
            return result

        mean_val = sum(values) / len(values)
        if mean_val == 0:
            if all(v == 0 for v in values):
                result.status = ConsistencyStatus.CONSISTENT
                result.explanation = "All sources report zero."
            else:
                result.status = ConsistencyStatus.CONFLICTING
                result.explanation = "Mixed zero and non-zero values."
            return result

        # Calculate deviation
        deviations = [abs(v - mean_val) / abs(mean_val) for v in values]
        max_dev = max(deviations)
        variance = sum(d ** 2 for d in deviations) / len(deviations)

        result.variance = variance
        result.max_deviation = max_dev

        if max_dev <= self.MINOR_VARIANCE_THRESHOLD:
            result.status = ConsistencyStatus.CONSISTENT
            result.explanation = (
                f"All sources agree within {self.MINOR_VARIANCE_THRESHOLD * 100}% tolerance. "
                f"Max deviation: {max_dev * 100:.1f}%."
            )
        elif max_dev <= self.CONFLICT_THRESHOLD:
            result.status = ConsistencyStatus.MINOR_VARIANCE
            result.explanation = (
                f"Sources show minor variance. "
                f"Max deviation: {max_dev * 100:.1f}% "
                f"(threshold: {self.CONFLICT_THRESHOLD * 100}%)."
            )
        else:
            result.status = ConsistencyStatus.CONFLICTING
            # Identify which sources conflict
            source_details = [
                f"{s.modality}={s.value} (p.{s.page_number + 1})"
                for s in sources if s.value is not None
            ]
            result.explanation = (
                f"CONFLICTING values detected. "
                f"Max deviation: {max_dev * 100:.1f}%. "
                f"Sources: {', '.join(source_details)}. "
                f"DO NOT silently choose one source — review all evidence."
            )

        return result

    def _extract_numeric(self, name: str, properties: dict) -> Optional[float]:
        """Extract numeric value from entity."""
        for key in ["value", "amount", "quantity"]:
            if key in properties:
                try:
                    return float(properties[key])
                except (ValueError, TypeError):
                    pass

        numbers = re.findall(r'[-+]?\d[\d,]*\.?\d*', name)
        if numbers:
            try:
                return float(numbers[0].replace(",", ""))
            except ValueError:
                pass
        return None
