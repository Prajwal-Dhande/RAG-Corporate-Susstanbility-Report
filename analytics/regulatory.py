"""
Sustainability MMKG-RAG: Regulatory Framework Mapping

Maps extracted KPIs and targets against major ESG reporting frameworks:
GRI, SASB, TCFD, EU Taxonomy
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from mmkg.graph_builder import GraphBackend
from mmkg.ontology import EntityType

logger = logging.getLogger(__name__)


# Framework definitions with indicator keywords
FRAMEWORKS = {
    "GRI": {
        "name": "Global Reporting Initiative",
        "indicators": {
            "GRI 302": {"name": "Energy", "keywords": ["energy consumption", "energy intensity", "renewable energy", "electricity"]},
            "GRI 303": {"name": "Water & Effluents", "keywords": ["water withdrawal", "water consumption", "water discharge", "water stress"]},
            "GRI 305": {"name": "Emissions", "keywords": ["scope 1", "scope 2", "scope 3", "ghg emission", "co2", "carbon"]},
            "GRI 306": {"name": "Waste", "keywords": ["waste generated", "waste diverted", "recycling", "hazardous waste"]},
            "GRI 401": {"name": "Employment", "keywords": ["employee turnover", "new hire", "retention", "employment"]},
            "GRI 403": {"name": "Occupational Health", "keywords": ["injury rate", "lost time", "safety", "occupational health"]},
            "GRI 405": {"name": "Diversity", "keywords": ["diversity", "gender", "board diversity", "pay equity"]},
            "GRI 413": {"name": "Local Communities", "keywords": ["community", "local community", "social impact"]},
        }
    },
    "SASB": {
        "name": "Sustainability Accounting Standards Board",
        "indicators": {
            "SASB E": {"name": "Environment", "keywords": ["ghg emission", "air quality", "energy management", "water management"]},
            "SASB S": {"name": "Social Capital", "keywords": ["human rights", "customer welfare", "data privacy", "access"]},
            "SASB HC": {"name": "Human Capital", "keywords": ["labor practice", "employee health", "diversity", "compensation"]},
            "SASB BM": {"name": "Business Model", "keywords": ["product design", "supply chain", "material sourcing"]},
            "SASB LG": {"name": "Leadership & Governance", "keywords": ["business ethics", "competitive behavior", "regulatory", "risk management"]},
        }
    },
    "TCFD": {
        "name": "Task Force on Climate-related Financial Disclosures",
        "indicators": {
            "TCFD-GOV": {"name": "Governance", "keywords": ["board oversight", "climate governance", "management role"]},
            "TCFD-STR": {"name": "Strategy", "keywords": ["climate risk", "climate opportunity", "scenario analysis", "transition risk", "physical risk"]},
            "TCFD-RM": {"name": "Risk Management", "keywords": ["risk identification", "risk assessment", "risk management process"]},
            "TCFD-MT": {"name": "Metrics & Targets", "keywords": ["scope 1", "scope 2", "scope 3", "climate target", "net zero", "carbon neutral"]},
        }
    },
    "EU_TAXONOMY": {
        "name": "EU Taxonomy for Sustainable Activities",
        "indicators": {
            "EU-CC": {"name": "Climate Change Mitigation", "keywords": ["climate mitigation", "emission reduction", "renewable", "net zero"]},
            "EU-CA": {"name": "Climate Change Adaptation", "keywords": ["climate adaptation", "resilience", "climate risk"]},
            "EU-WR": {"name": "Water & Marine Resources", "keywords": ["water", "marine", "ocean", "aquatic"]},
            "EU-CE": {"name": "Circular Economy", "keywords": ["circular economy", "recycling", "waste reduction", "reuse"]},
            "EU-PP": {"name": "Pollution Prevention", "keywords": ["pollution", "air quality", "soil", "contamination"]},
            "EU-BD": {"name": "Biodiversity & Ecosystems", "keywords": ["biodiversity", "ecosystem", "deforestation", "land use"]},
        }
    },
}


@dataclass
class FrameworkIndicatorResult:
    """Result for a single framework indicator."""
    code: str
    name: str
    covered: bool
    matched_entities: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "code": self.code,
            "name": self.name,
            "covered": self.covered,
            "matched_entities": self.matched_entities[:5],  # top 5 matches
        }


@dataclass
class FrameworkCoverage:
    """Coverage result for a single reporting framework."""
    framework_id: str
    framework_name: str
    coverage_percent: float
    indicators_covered: int
    indicators_total: int
    indicators: list[FrameworkIndicatorResult] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "framework_id": self.framework_id,
            "framework_name": self.framework_name,
            "coverage_percent": round(self.coverage_percent, 1),
            "indicators_covered": self.indicators_covered,
            "indicators_total": self.indicators_total,
            "indicators": [i.to_dict() for i in self.indicators],
        }


class RegulatoryMapper:
    """Maps extracted report data against ESG reporting frameworks."""

    def __init__(self, graph: GraphBackend):
        self.graph = graph

    async def map_frameworks(self, report_id: str) -> list[FrameworkCoverage]:
        """Map report data against all frameworks."""
        # Get all entities
        all_entities = []
        for etype in [EntityType.KPI.value, EntityType.TARGET.value,
                      EntityType.METRIC.value]:
            entities = await self.graph.get_entities_by_type(etype, report_id)
            all_entities.extend(entities)

        try:
            generic = await self.graph.get_all_entities(report_id)
            all_entities.extend(generic)
        except Exception:
            pass

        # Build searchable items
        entity_texts = []
        for e in all_entities:
            text = f"{e.name} {getattr(e, 'description', '') or ''}".lower()
            entity_texts.append((e.name, text))

        results = []
        for fw_id, fw_def in FRAMEWORKS.items():
            coverage = self._check_framework(fw_id, fw_def, entity_texts)
            results.append(coverage)

        return results

    def _check_framework(
        self,
        fw_id: str,
        fw_def: dict,
        entity_texts: list[tuple[str, str]],
    ) -> FrameworkCoverage:
        """Check coverage for a single framework."""
        indicators = []
        covered_count = 0

        for code, indicator_def in fw_def["indicators"].items():
            matched = []
            for entity_name, entity_text in entity_texts:
                if any(kw in entity_text for kw in indicator_def["keywords"]):
                    if entity_name not in matched:
                        matched.append(entity_name)

            is_covered = len(matched) > 0
            if is_covered:
                covered_count += 1

            indicators.append(FrameworkIndicatorResult(
                code=code,
                name=indicator_def["name"],
                covered=is_covered,
                matched_entities=matched,
            ))

        total = len(fw_def["indicators"])
        pct = (covered_count / total * 100) if total > 0 else 0

        return FrameworkCoverage(
            framework_id=fw_id,
            framework_name=fw_def["name"],
            coverage_percent=pct,
            indicators_covered=covered_count,
            indicators_total=total,
            indicators=indicators,
        )
