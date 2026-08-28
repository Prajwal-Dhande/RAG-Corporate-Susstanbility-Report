"""
Sustainability MMKG-RAG: ESG Scoring Engine

Computes an ESG compliance score (0-100) for each report based on
extracted entities, KPIs, targets, and consistency results.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

from mmkg.graph_builder import GraphBackend
from mmkg.ontology import EntityType

logger = logging.getLogger(__name__)


@dataclass
class ESGDimensionScore:
    """Score for a single ESG dimension."""
    dimension: str  # "Environmental", "Social", "Governance"
    score: float  # 0-100
    max_score: float  # maximum possible
    indicators_found: int
    indicators_total: int
    details: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "dimension": self.dimension,
            "score": round(self.score, 1),
            "max_score": round(self.max_score, 1),
            "indicators_found": self.indicators_found,
            "indicators_total": self.indicators_total,
            "details": self.details,
        }


@dataclass
class ESGScoreCard:
    """Complete ESG Score Card for a report."""
    overall_score: float
    grade: str
    environmental: ESGDimensionScore
    social: ESGDimensionScore
    governance: ESGDimensionScore
    coverage_percent: float
    strengths: list[str] = field(default_factory=list)
    gaps: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "overall_score": round(self.overall_score, 1),
            "grade": self.grade,
            "environmental": self.environmental.to_dict(),
            "social": self.social.to_dict(),
            "governance": self.governance.to_dict(),
            "coverage_percent": round(self.coverage_percent, 1),
            "strengths": self.strengths,
            "gaps": self.gaps,
        }


# ESG indicator definitions
ENVIRONMENTAL_INDICATORS = [
    ("scope_1", ["scope 1", "direct emission"]),
    ("scope_2", ["scope 2", "indirect emission", "electricity emission"]),
    ("scope_3", ["scope 3", "value chain emission"]),
    ("energy_consumption", ["energy consumption", "total energy", "electricity use"]),
    ("renewable_energy", ["renewable energy", "clean energy", "solar", "wind"]),
    ("water_usage", ["water consumption", "water use", "water withdrawal"]),
    ("waste_management", ["waste", "recycling", "circular economy", "landfill"]),
    ("carbon_intensity", ["carbon intensity", "emission intensity"]),
    ("biodiversity", ["biodiversity", "ecosystem", "land use"]),
    ("net_zero", ["net zero", "carbon neutral", "climate neutral"]),
]

SOCIAL_INDICATORS = [
    ("employee_safety", ["safety", "injury rate", "lost time", "osha", "trir"]),
    ("diversity", ["diversity", "inclusion", "gender", "representation"]),
    ("employee_training", ["training", "development", "learning hours"]),
    ("community", ["community", "philanthropy", "charitable", "volunteer"]),
    ("human_rights", ["human rights", "labor rights", "child labor", "forced labor"]),
    ("supply_chain", ["supply chain", "supplier", "responsible sourcing"]),
    ("data_privacy", ["data privacy", "cybersecurity", "information security"]),
    ("health_wellbeing", ["health", "wellbeing", "wellness", "mental health"]),
]

GOVERNANCE_INDICATORS = [
    ("board_composition", ["board", "independent director", "board diversity"]),
    ("ethics", ["ethics", "code of conduct", "anti-corruption", "bribery"]),
    ("transparency", ["transparency", "disclosure", "reporting framework"]),
    ("risk_management", ["risk management", "climate risk", "esg risk"]),
    ("stakeholder", ["stakeholder engagement", "materiality assessment"]),
    ("executive_comp", ["executive compensation", "pay ratio", "incentive"]),
]


class ESGScorer:
    """Computes ESG scores from extracted knowledge graph data."""

    def __init__(self, graph: GraphBackend):
        self.graph = graph

    async def compute_score(self, report_id: str) -> ESGScoreCard:
        """Compute full ESG score card for a report."""
        # Get all entities
        all_entities = []
        for etype in [EntityType.KPI.value, EntityType.TARGET.value,
                      EntityType.ORGANIZATION.value, EntityType.METRIC.value]:
            entities = await self.graph.get_entities_by_type(etype, report_id)
            all_entities.extend(entities)

        # Also get generic entities
        try:
            generic = await self.graph.get_all_entities(report_id)
            all_entities.extend(generic)
        except Exception:
            pass

        # Build searchable text corpus from all entity names and descriptions
        corpus_items = []
        for e in all_entities:
            text = f"{e.name} {getattr(e, 'description', '') or ''}".lower()
            corpus_items.append(text)
        full_corpus = " ".join(corpus_items)

        # Score each dimension
        env_score = self._score_dimension("Environmental", ENVIRONMENTAL_INDICATORS, full_corpus)
        soc_score = self._score_dimension("Social", SOCIAL_INDICATORS, full_corpus)
        gov_score = self._score_dimension("Governance", GOVERNANCE_INDICATORS, full_corpus)

        # Overall weighted score (E=40%, S=30%, G=30%)
        overall = (env_score.score * 0.40 +
                   soc_score.score * 0.30 +
                   gov_score.score * 0.30)

        # Grade
        grade = self._compute_grade(overall)

        # Coverage
        total_indicators = (env_score.indicators_total +
                            soc_score.indicators_total +
                            gov_score.indicators_total)
        found_indicators = (env_score.indicators_found +
                            soc_score.indicators_found +
                            gov_score.indicators_found)
        coverage = (found_indicators / total_indicators * 100) if total_indicators > 0 else 0

        # Strengths and gaps
        strengths = []
        gaps = []
        for dim in [env_score, soc_score, gov_score]:
            for detail in dim.details:
                if detail["found"]:
                    strengths.append(f"{dim.dimension}: {detail['name']}")
                else:
                    gaps.append(f"{dim.dimension}: {detail['name']}")

        return ESGScoreCard(
            overall_score=overall,
            grade=grade,
            environmental=env_score,
            social=soc_score,
            governance=gov_score,
            coverage_percent=coverage,
            strengths=strengths[:10],  # top 10
            gaps=gaps[:10],
        )

    def _score_dimension(
        self,
        dimension: str,
        indicators: list[tuple[str, list[str]]],
        corpus: str,
    ) -> ESGDimensionScore:
        """Score a single ESG dimension."""
        found = 0
        details = []

        for indicator_id, keywords in indicators:
            matched = any(kw in corpus for kw in keywords)
            if matched:
                found += 1
            details.append({
                "id": indicator_id,
                "name": indicator_id.replace("_", " ").title(),
                "found": matched,
            })

        total = len(indicators)
        score = (found / total * 100) if total > 0 else 0

        return ESGDimensionScore(
            dimension=dimension,
            score=score,
            max_score=100.0,
            indicators_found=found,
            indicators_total=total,
            details=details,
        )

    def _compute_grade(self, score: float) -> str:
        """Map score to letter grade."""
        if score >= 90: return "A+"
        if score >= 80: return "A"
        if score >= 70: return "B+"
        if score >= 60: return "B"
        if score >= 50: return "C+"
        if score >= 40: return "C"
        if score >= 30: return "D"
        return "F"
