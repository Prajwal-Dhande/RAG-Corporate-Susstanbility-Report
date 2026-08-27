"""
Sustainability MMKG-RAG: Reasoning Engine

Explicit multi-step reasoning over the knowledge graph.
Performs deterministic calculations — LLM explains but does NOT compute.

PROJECT-SPECIFIC EXTENSION: This is a major addition beyond the KG4VD reference.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Optional

from mmkg.graph_builder import GraphBackend
from mmkg.ontology import EntityType, RelationType, TargetStatus
from reasoning.units import UnitNormalizer

logger = logging.getLogger(__name__)


@dataclass
class ReasoningStep:
    """A single step in a reasoning path."""
    step: int
    action: str  # lookup, traverse, calculate, compare, conclude
    description: str
    entity_id: Optional[str] = None
    entity_name: Optional[str] = None
    value: Any = None
    evidence_pages: list[int] = field(default_factory=list)


@dataclass
class ReasoningResult:
    """Complete result of a reasoning process."""
    analysis_type: str
    status: str  # completed, partial, failed
    conclusion: dict[str, Any] = field(default_factory=dict)
    reasoning_path: list[ReasoningStep] = field(default_factory=list)
    evidence_pages: list[int] = field(default_factory=list)
    confidence: float = 0.0
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "analysis_type": self.analysis_type,
            "status": self.status,
            "conclusion": self.conclusion,
            "reasoning_path": [
                {
                    "step": s.step,
                    "action": s.action,
                    "description": s.description,
                    "entity_name": s.entity_name,
                    "value": s.value,
                    "evidence_pages": s.evidence_pages,
                }
                for s in self.reasoning_path
            ],
            "evidence_pages": self.evidence_pages,
            "confidence": self.confidence,
            "warnings": self.warnings,
        }


class ReasoningEngine:
    """
    Explicit graph reasoning engine.

    Performs multi-hop traversal over the knowledge graph
    and deterministic calculations for target analysis.

    Key reasoning patterns:
    - Target → Baseline → KPI → Current Value → Gap → Status
    - KPI → Values over time → Trend
    - KPI → Multiple sources → Consistency check
    """

    def __init__(self, graph: GraphBackend):
        self.graph = graph
        self.unit_normalizer = UnitNormalizer()

    async def analyze_target_progress(
        self,
        report_id: str,
        kpi_name: Optional[str] = None,
    ) -> list[ReasoningResult]:
        """
        Analyze target vs actual progress for KPIs.

        Reasoning path:
        Target → Baseline → KPI → Current Value → Target Value → Gap → Status
        """
        results = []

        # Step 1: Find all targets
        targets = await self.graph.get_entities_by_type(EntityType.TARGET.value, report_id)
        if kpi_name:
            targets = [t for t in targets if kpi_name.lower() in t.name.lower()]

        if not targets:
            return [ReasoningResult(
                analysis_type="target_progress",
                status="failed",
                warnings=["No targets found in the knowledge graph"],
            )]

        for target in targets:
            result = await self._analyze_single_target(target, report_id)
            results.append(result)

        return results

    async def _analyze_single_target(self, target, report_id: str) -> ReasoningResult:
        """Analyze a single target's progress using graph traversal."""
        steps = []
        evidence_pages = set()
        warnings = []

        # Step 1: Identify target
        step1 = ReasoningStep(
            step=1,
            action="lookup",
            description=f"Found target: {target.name}",
            entity_id=target.id,
            entity_name=target.name,
            value=target.properties,
            evidence_pages=target.page_numbers,
        )
        steps.append(step1)
        evidence_pages.update(target.page_numbers)

        # Step 2: Find associated KPI via graph traversal
        neighbors = await self.graph.get_entity_neighbors(target.id, max_depth=2)
        kpi = None
        baseline = None
        current_value = None
        target_value = None
        deadline = None

        for entity in neighbors.get("entities", []):
            etype = entity.type if isinstance(entity.type, str) else entity.type.value
            if etype == EntityType.KPI.value and kpi is None:
                kpi = entity
            elif etype == EntityType.BASELINE.value and baseline is None:
                baseline = entity
            elif etype in (EntityType.ACTUAL_VALUE.value, EntityType.KPI_VALUE.value):
                current_value = entity
            elif etype == EntityType.DEADLINE.value:
                deadline = entity

        # Extract numeric values from properties and names
        target_num = self._extract_number(target.name, target.properties)
        baseline_num = self._extract_number(
            baseline.name if baseline else "", baseline.properties if baseline else {}
        )
        current_num = self._extract_number(
            current_value.name if current_value else "",
            current_value.properties if current_value else {},
        )

        # Step 2: Record KPI
        if kpi:
            step2 = ReasoningStep(
                step=2, action="traverse",
                description=f"Associated KPI: {kpi.name}",
                entity_id=kpi.id, entity_name=kpi.name,
                evidence_pages=kpi.page_numbers,
            )
            steps.append(step2)
            evidence_pages.update(kpi.page_numbers)
        else:
            warnings.append("Could not find associated KPI for target")

        # Step 3: Record baseline
        if baseline:
            step3 = ReasoningStep(
                step=3, action="traverse",
                description=f"Baseline: {baseline.name}",
                entity_id=baseline.id, entity_name=baseline.name,
                value=baseline_num,
                evidence_pages=baseline.page_numbers,
            )
            steps.append(step3)
            evidence_pages.update(baseline.page_numbers)

        # Step 4: Current value
        if current_value:
            step4 = ReasoningStep(
                step=4, action="traverse",
                description=f"Current value: {current_value.name}",
                entity_id=current_value.id, entity_name=current_value.name,
                value=current_num,
                evidence_pages=current_value.page_numbers,
            )
            steps.append(step4)
            evidence_pages.update(current_value.page_numbers)

        # Step 5: DETERMINISTIC calculation
        gap = None
        progress_percent = None
        status = TargetStatus.UNKNOWN

        if target_num is not None and current_num is not None:
            gap = target_num - current_num
            step5 = ReasoningStep(
                step=5, action="calculate",
                description=f"Gap = Target ({target_num}) - Current ({current_num}) = {gap}",
                value={"target": target_num, "current": current_num, "gap": gap},
            )
            steps.append(step5)

            if target_num != 0:
                progress_percent = (current_num / target_num) * 100
            if baseline_num is not None and target_num != baseline_num:
                progress_from_baseline = abs(current_num - baseline_num) / abs(target_num - baseline_num) * 100
                progress_percent = min(progress_from_baseline, 999)

            # Determine status
            if gap <= 0:
                status = TargetStatus.ACHIEVED
            elif progress_percent and progress_percent >= 80:
                status = TargetStatus.ON_TRACK
            elif progress_percent and progress_percent >= 50:
                status = TargetStatus.BEHIND
            else:
                status = TargetStatus.BEHIND

            step6 = ReasoningStep(
                step=6, action="conclude",
                description=f"Status: {status.value} (progress: {progress_percent:.1f}%)" if progress_percent else f"Status: {status.value}",
                value={"status": status.value, "progress_percent": progress_percent},
            )
            steps.append(step6)
        else:
            warnings.append("Insufficient numeric data for gap calculation")
            status = TargetStatus.UNKNOWN

        conclusion = {
            "target_name": target.name,
            "kpi_name": kpi.name if kpi else None,
            "target_value": target_num,
            "baseline_value": baseline_num,
            "current_value": current_num,
            "gap": gap,
            "progress_percent": progress_percent,
            "status": status.value,
            "deadline": deadline.name if deadline else None,
        }

        return ReasoningResult(
            analysis_type="target_progress",
            status="completed" if target_num is not None else "partial",
            conclusion=conclusion,
            reasoning_path=steps,
            evidence_pages=sorted(evidence_pages),
            confidence=min(e.confidence for e in [target] + ([kpi] if kpi else [])) if kpi else target.confidence,
            warnings=warnings,
        )

    async def analyze_emissions(self, report_id: str) -> ReasoningResult:
        """Analyze emissions data from the knowledge graph."""
        steps = []
        evidence_pages = set()

        # Find emission-related KPIs
        all_entities = await self.graph.get_all_entities(report_id)
        emission_entities = [
            e for e in all_entities
            if any(kw in e.name.lower() for kw in ["emission", "ghg", "co2", "carbon", "scope"])
        ]

        emissions_data = {}
        for entity in emission_entities:
            steps.append(ReasoningStep(
                step=len(steps) + 1,
                action="lookup",
                description=f"Found emission entity: {entity.name}",
                entity_id=entity.id,
                entity_name=entity.name,
                evidence_pages=entity.page_numbers,
            ))
            evidence_pages.update(entity.page_numbers)

            # Get values
            neighbors = await self.graph.get_entity_neighbors(entity.id, max_depth=1)
            for neighbor in neighbors.get("entities", []):
                ntype = neighbor.type if isinstance(neighbor.type, str) else neighbor.type.value
                if ntype in (EntityType.KPI_VALUE.value, EntityType.ACTUAL_VALUE.value):
                    num = self._extract_number(neighbor.name, neighbor.properties)
                    if num is not None:
                        emissions_data[entity.name] = {
                            "value": num,
                            "entity_id": entity.id,
                            "pages": entity.page_numbers,
                        }

        return ReasoningResult(
            analysis_type="emissions",
            status="completed" if emissions_data else "partial",
            conclusion={"emissions": emissions_data, "entity_count": len(emission_entities)},
            reasoning_path=steps,
            evidence_pages=sorted(evidence_pages),
            confidence=0.7 if emissions_data else 0.3,
        )

    def _extract_number(self, name: str, properties: dict) -> Optional[float]:
        """Extract a numeric value from entity name or properties."""
        # Check properties first
        for key in ["value", "amount", "quantity", "number"]:
            if key in properties:
                try:
                    return float(properties[key])
                except (ValueError, TypeError):
                    pass

        # Try extracting from name
        import re
        numbers = re.findall(r'[-+]?\d*\.?\d+', name)
        if numbers:
            try:
                return float(numbers[0])
            except ValueError:
                pass

        return None
