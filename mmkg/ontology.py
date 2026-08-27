"""
Sustainability MMKG-RAG: Sustainability Knowledge Graph Ontology

Defines the domain-specific entity types, relation types, and validation rules
for the sustainability knowledge graph.

This is a PROJECT-SPECIFIC EXTENSION (not from the reference architecture).
The reference KG4VD architecture provides generic multimodal KG construction;
this ontology specializes it for corporate sustainability report analysis.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from typing import Any, Optional


# ──────────────────────────────────────────────
# Entity Types (Section 6 of spec)
# ──────────────────────────────────────────────

class EntityType(str, enum.Enum):
    """Core entity types in the sustainability ontology."""

    # Organizational
    COMPANY = "Company"
    REPORT = "Report"
    REPORT_VERSION = "ReportVersion"

    # Document structure
    PAGE = "Page"
    SECTION = "Section"
    PARAGRAPH = "Paragraph"
    TABLE = "Table"
    CHART = "Chart"
    FIGURE = "Figure"
    EVIDENCE = "Evidence"
    CLAIM = "Claim"

    # Sustainability metrics
    KPI = "KPI"
    KPI_VALUE = "KPIValue"
    UNIT = "Unit"
    TARGET = "Target"
    BASELINE = "Baseline"
    ACTUAL_VALUE = "ActualValue"
    COMMITMENT = "Commitment"
    FISCAL_PERIOD = "FiscalPeriod"
    DEADLINE = "Deadline"

    # Dimensions
    BUSINESS_SEGMENT = "BusinessSegment"
    GEOGRAPHIC_REGION = "GeographicRegion"
    EMISSION_SCOPE = "EmissionScope"
    MATERIAL_TOPIC = "MaterialTopic"
    STAKEHOLDER_GROUP = "StakeholderGroup"
    REGULATORY_FRAMEWORK = "RegulatoryFramework"
    SUSTAINABILITY_GOAL = "SustainabilityGoal"


# ──────────────────────────────────────────────
# Relation Types (Section 6 of spec)
# ──────────────────────────────────────────────

class RelationType(str, enum.Enum):
    """Core relation types in the sustainability ontology."""

    # Structural
    HAS_REPORT = "HAS_REPORT"
    HAS_VERSION = "HAS_VERSION"
    CONTAINS_PAGE = "CONTAINS_PAGE"
    CONTAINS_SECTION = "CONTAINS_SECTION"
    CONTAINS_COMPONENT = "CONTAINS_COMPONENT"

    # Metrics
    HAS_KPI = "HAS_KPI"
    HAS_VALUE = "HAS_VALUE"
    MEASURED_IN = "MEASURED_IN"
    HAS_UNIT = "HAS_UNIT"
    HAS_BASELINE = "HAS_BASELINE"
    HAS_TARGET = "HAS_TARGET"
    HAS_DEADLINE = "HAS_DEADLINE"

    # Evidence
    SUPPORTS = "SUPPORTS"
    SUPPORTED_BY = "SUPPORTED_BY"
    REPORTED_IN = "REPORTED_IN"
    VISUALIZES = "VISUALIZES"
    DERIVED_FROM = "DERIVED_FROM"

    # Organizational
    BELONGS_TO_SEGMENT = "BELONGS_TO_SEGMENT"
    LOCATED_IN = "LOCATED_IN"
    APPLIES_TO_REGION = "APPLIES_TO_REGION"

    # Analytical
    RELATED_TO = "RELATED_TO"
    CAUSES = "CAUSES"
    REDUCES = "REDUCES"
    INCREASES = "INCREASES"
    IMPROVES = "IMPROVES"

    # Resolution
    SAME_ENTITY_AS = "SAME_ENTITY_AS"
    PRECEDES = "PRECEDES"
    SUPERSEDES = "SUPERSEDES"
    CONTRADICTS = "CONTRADICTS"

    # Location
    MENTIONED_ON = "MENTIONED_ON"
    LOCATED_IN_REGION = "LOCATED_IN_REGION"


# ──────────────────────────────────────────────
# KPI Categories
# ──────────────────────────────────────────────

class KPICategory(str, enum.Enum):
    """Sustainability KPI categories."""
    EMISSIONS = "emissions"
    ENERGY = "energy"
    WATER = "water"
    WASTE = "waste"
    BIODIVERSITY = "biodiversity"
    SOCIAL = "social"
    GOVERNANCE = "governance"
    ECONOMIC = "economic"
    SUPPLY_CHAIN = "supply_chain"
    OTHER = "other"


# ──────────────────────────────────────────────
# Emission Scope
# ──────────────────────────────────────────────

class EmissionScopeType(str, enum.Enum):
    SCOPE_1 = "Scope 1"
    SCOPE_2 = "Scope 2"
    SCOPE_3 = "Scope 3"
    TOTAL = "Total"


# ──────────────────────────────────────────────
# Consistency Status
# ──────────────────────────────────────────────

class ConsistencyStatus(str, enum.Enum):
    CONSISTENT = "CONSISTENT"
    MINOR_VARIANCE = "MINOR_VARIANCE"
    CONFLICTING = "CONFLICTING"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"
    UNVERIFIED = "UNVERIFIED"


# ──────────────────────────────────────────────
# Target Status
# ──────────────────────────────────────────────

class TargetStatus(str, enum.Enum):
    ON_TRACK = "on_track"
    BEHIND = "behind"
    AHEAD = "ahead"
    ACHIEVED = "achieved"
    NOT_STARTED = "not_started"
    UNKNOWN = "unknown"


# ──────────────────────────────────────────────
# Graph Data Classes
# ──────────────────────────────────────────────

@dataclass
class GraphEntity:
    """An entity in the knowledge graph."""
    id: str
    name: str
    type: EntityType
    modality: str = "text"  # text, table, chart, figure, mixed
    description: str = ""
    source_component_ids: list[str] = field(default_factory=list)
    confidence: float = 0.0
    properties: dict[str, Any] = field(default_factory=dict)

    # Provenance
    report_id: str = ""
    page_numbers: list[int] = field(default_factory=list)
    bounding_boxes: list[list[float]] = field(default_factory=list)
    source_text: str = ""
    extraction_method: str = ""
    model_name: str = ""

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type.value if isinstance(self.type, EntityType) else self.type,
            "modality": self.modality,
            "description": self.description,
            "source_component_ids": self.source_component_ids,
            "confidence": self.confidence,
            "properties": self.properties,
            "report_id": self.report_id,
            "page_numbers": self.page_numbers,
            "source_text": self.source_text,
            "extraction_method": self.extraction_method,
            "model_name": self.model_name,
        }


@dataclass
class GraphRelation:
    """A relation in the knowledge graph."""
    id: str
    source_id: str
    relation: RelationType
    target_id: str
    description: str = ""
    source_component_ids: list[str] = field(default_factory=list)
    confidence: float = 0.0
    properties: dict[str, Any] = field(default_factory=dict)

    # Provenance
    report_id: str = ""
    page_numbers: list[int] = field(default_factory=list)
    extraction_method: str = ""
    model_name: str = ""

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "source_id": self.source_id,
            "relation": self.relation.value if isinstance(self.relation, RelationType) else self.relation,
            "target_id": self.target_id,
            "description": self.description,
            "source_component_ids": self.source_component_ids,
            "confidence": self.confidence,
            "properties": self.properties,
            "report_id": self.report_id,
            "page_numbers": self.page_numbers,
        }


@dataclass
class GraphClaim:
    """A sustainability claim extracted from a document."""
    id: str
    statement: str
    claim_type: str  # quantitative, qualitative, commitment, target
    entities: list[str] = field(default_factory=list)  # Entity IDs
    evidence_ids: list[str] = field(default_factory=list)
    page_numbers: list[int] = field(default_factory=list)
    confidence: float = 0.0
    verification_status: str = "unverified"


@dataclass
class ExtractionResult:
    """Result of entity/relation extraction from a page."""
    entities: list[GraphEntity] = field(default_factory=list)
    relations: list[GraphRelation] = field(default_factory=list)
    claims: list[GraphClaim] = field(default_factory=list)

    @property
    def entity_count(self) -> int:
        return len(self.entities)

    @property
    def relation_count(self) -> int:
        return len(self.relations)


# ──────────────────────────────────────────────
# Ontology Validation
# ──────────────────────────────────────────────

# Valid relation endpoints
VALID_RELATIONS: dict[RelationType, list[tuple[set[EntityType], set[EntityType]]]] = {
    RelationType.HAS_REPORT: [({EntityType.COMPANY}, {EntityType.REPORT})],
    RelationType.HAS_KPI: [
        ({EntityType.COMPANY, EntityType.REPORT, EntityType.BUSINESS_SEGMENT}, {EntityType.KPI}),
    ],
    RelationType.HAS_VALUE: [({EntityType.KPI}, {EntityType.KPI_VALUE, EntityType.ACTUAL_VALUE})],
    RelationType.HAS_TARGET: [({EntityType.KPI}, {EntityType.TARGET})],
    RelationType.HAS_BASELINE: [({EntityType.KPI, EntityType.TARGET}, {EntityType.BASELINE})],
    RelationType.HAS_DEADLINE: [({EntityType.TARGET, EntityType.COMMITMENT}, {EntityType.DEADLINE})],
    RelationType.HAS_UNIT: [({EntityType.KPI, EntityType.KPI_VALUE, EntityType.TARGET}, {EntityType.UNIT})],
    RelationType.MENTIONED_ON: [
        ({EntityType.KPI, EntityType.TARGET, EntityType.COMMITMENT, EntityType.CLAIM}, {EntityType.PAGE}),
    ],
    RelationType.SAME_ENTITY_AS: [
        ({EntityType.KPI}, {EntityType.KPI}),
        ({EntityType.COMPANY}, {EntityType.COMPANY}),
    ],
}


def validate_entity(entity: GraphEntity) -> list[str]:
    """Validate an entity against the ontology. Returns list of validation errors."""
    errors = []
    if not entity.name or not entity.name.strip():
        errors.append(f"Entity {entity.id}: name is empty")
    if not isinstance(entity.type, EntityType):
        try:
            EntityType(entity.type)
        except ValueError:
            errors.append(f"Entity {entity.id}: invalid type '{entity.type}'")
    if entity.confidence < 0 or entity.confidence > 1:
        errors.append(f"Entity {entity.id}: confidence {entity.confidence} out of [0,1]")
    return errors


def validate_relation(
    relation: GraphRelation,
    entities: dict[str, GraphEntity],
) -> list[str]:
    """Validate a relation against the ontology. Returns list of validation errors."""
    errors = []
    if relation.source_id not in entities:
        errors.append(f"Relation {relation.id}: source entity '{relation.source_id}' not found")
    if relation.target_id not in entities:
        errors.append(f"Relation {relation.id}: target entity '{relation.target_id}' not found")
    if relation.source_id == relation.target_id:
        errors.append(f"Relation {relation.id}: self-referencing relation")
    if relation.confidence < 0 or relation.confidence > 1:
        errors.append(f"Relation {relation.id}: confidence {relation.confidence} out of [0,1]")
    return errors
