"""
Sustainability MMKG-RAG: VLM Entity & Relation Extractor

Uses multimodal LLM (GPT-4o-mini) to extract sustainability entities,
relations, and claims from each page.

REFERENCE-INSPIRED: Page-level multimodal extraction from KG4VD.
PROJECT-SPECIFIC: Sustainability ontology-constrained extraction.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Optional

from document_pipeline.parser import ParsedPage
from mmkg.ontology import (
    EntityType,
    ExtractionResult,
    GraphClaim,
    GraphEntity,
    GraphRelation,
    RelationType,
    validate_entity,
    validate_relation,
)
from models.provider import ModelProvider, get_model_provider

logger = logging.getLogger(__name__)

# System prompt for sustainability entity extraction
EXTRACTION_SYSTEM_PROMPT = """You are an expert sustainability report analyst. Your task is to extract structured information from corporate sustainability/ESG report pages.

You must extract:
1. ENTITIES: Sustainability KPIs, targets, commitments, metrics, organizations, time periods, etc.
2. RELATIONS: How entities relate (e.g., a KPI has a target value, a company has an emission scope)
3. CLAIMS: Specific sustainability claims made in the text

ENTITY TYPES you should look for:
- KPI: Any sustainability metric (e.g., "GHG Emissions", "Renewable Energy Share", "Water Consumption")
- KPIValue: A specific numeric value for a KPI
- Target: A sustainability target or goal
- Baseline: A baseline reference value
- ActualValue: A reported actual/current value
- Unit: Measurement unit (e.g., "Mt CO2e", "GWh", "liters")
- FiscalPeriod: A time period (e.g., "FY2023", "2024", "Q3 2024")
- Deadline: A target deadline
- Commitment: A sustainability commitment or pledge
- EmissionScope: Scope 1, 2, or 3 emissions
- BusinessSegment: A business division or segment
- GeographicRegion: A geographic area
- MaterialTopic: A material sustainability topic
- RegulatoryFramework: A framework (GRI, TCFD, SASB, etc.)
- SustainabilityGoal: An SDG or other sustainability goal

RELATION TYPES:
- HAS_KPI, HAS_VALUE, HAS_TARGET, HAS_BASELINE, HAS_DEADLINE
- MEASURED_IN, HAS_UNIT
- SUPPORTS, SUPPORTED_BY, REPORTED_IN
- BELONGS_TO_SEGMENT, APPLIES_TO_REGION
- RELATED_TO, REDUCES, INCREASES
- MENTIONED_ON

RULES:
- Extract ONLY what is explicitly stated. Do NOT infer or hallucinate.
- Each entity must reference the source component IDs from the layout.
- Assign confidence scores (0.0-1.0) based on clarity of the source.
- For tables, extract each row's KPI/value as separate entities.
- For charts, describe what the chart shows and extract key data points.
- Prefer specific entity names over generic ones.

Respond in JSON format ONLY."""

EXTRACTION_USER_PROMPT = """Analyze this sustainability report page and extract all sustainability-related entities, relations, and claims.

Page number: {page_number}

Page layout components:
{component_manifest}

Extracted text:
{page_text}

Respond with a JSON object containing:
{{
  "entities": [
    {{
      "name": "entity name",
      "type": "EntityType",
      "modality": "text|table|chart|figure",
      "description": "brief description",
      "source_component_ids": ["P1", "T1"],
      "confidence": 0.85,
      "properties": {{}}
    }}
  ],
  "relations": [
    {{
      "source": "source entity name",
      "relation": "RelationType",
      "target": "target entity name",
      "description": "brief description",
      "source_component_ids": ["T1"],
      "confidence": 0.80
    }}
  ],
  "claims": [
    {{
      "statement": "the exact claim",
      "claim_type": "quantitative|qualitative|commitment|target",
      "confidence": 0.75
    }}
  ]
}}"""


class EntityExtractor:
    """
    Extracts sustainability entities, relations, and claims from parsed pages
    using a multimodal LLM.
    """

    def __init__(self, model_provider: Optional[ModelProvider] = None):
        self.model = model_provider or get_model_provider()
        self.total_tokens_input = 0
        self.total_tokens_output = 0

    async def extract_from_page(
        self,
        parsed_page: ParsedPage,
        page_image: Optional[bytes] = None,
        report_id: str = "",
    ) -> ExtractionResult:
        """
        Extract entities, relations, and claims from a single page.

        Args:
            parsed_page: Parsed page with components
            page_image: Optional page image for multimodal extraction
            report_id: Report identifier for provenance

        Returns:
            ExtractionResult with validated entities and relations
        """
        # Build component manifest
        manifest = self._build_manifest(parsed_page)

        # Build prompt
        prompt = EXTRACTION_USER_PROMPT.format(
            page_number=parsed_page.page_number + 1,
            component_manifest=manifest,
            page_text=parsed_page.full_text[:4000],  # Truncate to avoid token limits
        )

        # Call model
        images = [page_image] if page_image else None
        try:
            response = await self.model.generate(
                prompt=prompt,
                images=images,
                system_prompt=EXTRACTION_SYSTEM_PROMPT,
                temperature=0.0,
                max_tokens=4096,
                json_mode=True,
            )
            self.total_tokens_input += response.tokens_input
            self.total_tokens_output += response.tokens_output
        except Exception as e:
            logger.error(f"Model call failed for page {parsed_page.page_number}: {e}")
            return ExtractionResult()

        # Parse response
        if response.parsed is None:
            logger.warning(f"No parsed JSON for page {parsed_page.page_number}")
            return ExtractionResult()

        # Build and validate entities
        result = self._parse_extraction_response(
            response.parsed,
            parsed_page,
            report_id,
        )

        logger.info(
            f"Page {parsed_page.page_number + 1}: extracted "
            f"{result.entity_count} entities, {result.relation_count} relations"
        )

        return result

    def _build_manifest(self, parsed_page: ParsedPage) -> str:
        """Build a text manifest of page components for the prompt."""
        lines = []
        for comp in parsed_page.components:
            line = f"[{comp.id}] type={comp.type}"
            if comp.text:
                preview = comp.text[:100].replace("\n", " ")
                line += f' text="{preview}..."'
            if comp.structured_data:
                cols = comp.structured_data.get("col_count", "?")
                rows = comp.structured_data.get("row_count", "?")
                line += f" table({rows}x{cols})"
            lines.append(line)
        return "\n".join(lines) if lines else "(no components detected)"

    def _parse_extraction_response(
        self,
        data: dict,
        parsed_page: ParsedPage,
        report_id: str,
    ) -> ExtractionResult:
        """Parse and validate the model's extraction response."""
        entities = []
        relations = []
        claims = []
        entity_map = {}

        # Valid component IDs on this page
        valid_comp_ids = {c.id for c in parsed_page.components}

        # Parse entities
        for e_data in data.get("entities", []):
            try:
                # Resolve entity type
                entity_type = self._resolve_entity_type(e_data.get("type", ""))
                if entity_type is None:
                    continue

                entity_id = str(uuid.uuid4())[:8]
                name = str(e_data.get("name", "")).strip()
                if not name:
                    continue

                # Validate source component IDs
                source_ids = [
                    sid for sid in e_data.get("source_component_ids", [])
                    if sid in valid_comp_ids
                ]

                entity = GraphEntity(
                    id=entity_id,
                    name=name,
                    type=entity_type,
                    modality=e_data.get("modality", "text"),
                    description=e_data.get("description", ""),
                    source_component_ids=source_ids,
                    confidence=min(1.0, max(0.0, float(e_data.get("confidence", 0.5)))),
                    properties=e_data.get("properties", {}),
                    report_id=report_id,
                    page_numbers=[parsed_page.page_number],
                    extraction_method="vlm_extraction",
                    model_name=self.model.get_name(),
                )

                # Validate
                errors = validate_entity(entity)
                if errors:
                    logger.warning(f"Entity validation errors: {errors}")
                    continue

                entities.append(entity)
                entity_map[name] = entity_id

            except Exception as e:
                logger.warning(f"Failed to parse entity: {e}")
                continue

        # Parse relations
        for r_data in data.get("relations", []):
            try:
                source_name = str(r_data.get("source", "")).strip()
                target_name = str(r_data.get("target", "")).strip()

                if source_name not in entity_map or target_name not in entity_map:
                    # Create entities for relation endpoints if they don't exist
                    if source_name and source_name not in entity_map:
                        eid = str(uuid.uuid4())[:8]
                        entity_map[source_name] = eid
                        entities.append(GraphEntity(
                            id=eid, name=source_name,
                            type=EntityType.KPI_VALUE,
                            report_id=report_id,
                            page_numbers=[parsed_page.page_number],
                            confidence=0.5,
                            extraction_method="vlm_extraction",
                            model_name=self.model.get_name(),
                        ))
                    if target_name and target_name not in entity_map:
                        eid = str(uuid.uuid4())[:8]
                        entity_map[target_name] = eid
                        entities.append(GraphEntity(
                            id=eid, name=target_name,
                            type=EntityType.KPI_VALUE,
                            report_id=report_id,
                            page_numbers=[parsed_page.page_number],
                            confidence=0.5,
                            extraction_method="vlm_extraction",
                            model_name=self.model.get_name(),
                        ))

                rel_type = self._resolve_relation_type(r_data.get("relation", ""))
                if rel_type is None:
                    rel_type = RelationType.RELATED_TO

                source_ids = [
                    sid for sid in r_data.get("source_component_ids", [])
                    if sid in valid_comp_ids
                ]

                relation = GraphRelation(
                    id=str(uuid.uuid4())[:8],
                    source_id=entity_map.get(source_name, ""),
                    relation=rel_type,
                    target_id=entity_map.get(target_name, ""),
                    description=r_data.get("description", ""),
                    source_component_ids=source_ids,
                    confidence=min(1.0, max(0.0, float(r_data.get("confidence", 0.5)))),
                    report_id=report_id,
                    page_numbers=[parsed_page.page_number],
                    extraction_method="vlm_extraction",
                    model_name=self.model.get_name(),
                )

                if relation.source_id and relation.target_id:
                    relations.append(relation)

            except Exception as e:
                logger.warning(f"Failed to parse relation: {e}")
                continue

        # Parse claims
        for c_data in data.get("claims", []):
            try:
                statement = str(c_data.get("statement", "")).strip()
                if not statement:
                    continue

                claim = GraphClaim(
                    id=str(uuid.uuid4())[:8],
                    statement=statement,
                    claim_type=c_data.get("claim_type", "qualitative"),
                    page_numbers=[parsed_page.page_number],
                    confidence=min(1.0, max(0.0, float(c_data.get("confidence", 0.5)))),
                )
                claims.append(claim)
            except Exception as e:
                logger.warning(f"Failed to parse claim: {e}")

        return ExtractionResult(
            entities=entities,
            relations=relations,
            claims=claims,
        )

    def _resolve_entity_type(self, type_str: str) -> Optional[EntityType]:
        """Try to resolve a string to an EntityType."""
        # Direct match
        for et in EntityType:
            if et.value.lower() == type_str.lower() or et.name.lower() == type_str.lower():
                return et
        # Fuzzy mapping
        mappings = {
            "kpi": EntityType.KPI,
            "metric": EntityType.KPI,
            "indicator": EntityType.KPI,
            "value": EntityType.KPI_VALUE,
            "kpivalue": EntityType.KPI_VALUE,
            "target": EntityType.TARGET,
            "goal": EntityType.TARGET,
            "baseline": EntityType.BASELINE,
            "actual": EntityType.ACTUAL_VALUE,
            "actualvalue": EntityType.ACTUAL_VALUE,
            "unit": EntityType.UNIT,
            "period": EntityType.FISCAL_PERIOD,
            "fiscalperiod": EntityType.FISCAL_PERIOD,
            "year": EntityType.FISCAL_PERIOD,
            "deadline": EntityType.DEADLINE,
            "commitment": EntityType.COMMITMENT,
            "pledge": EntityType.COMMITMENT,
            "scope": EntityType.EMISSION_SCOPE,
            "emissionscope": EntityType.EMISSION_SCOPE,
            "segment": EntityType.BUSINESS_SEGMENT,
            "region": EntityType.GEOGRAPHIC_REGION,
            "framework": EntityType.REGULATORY_FRAMEWORK,
            "sdg": EntityType.SUSTAINABILITY_GOAL,
            "company": EntityType.COMPANY,
            "organization": EntityType.COMPANY,
        }
        return mappings.get(type_str.lower().replace("_", "").replace(" ", ""))

    def _resolve_relation_type(self, rel_str: str) -> Optional[RelationType]:
        """Try to resolve a string to a RelationType."""
        for rt in RelationType:
            if rt.value.lower() == rel_str.lower() or rt.name.lower() == rel_str.lower():
                return rt
        mappings = {
            "has_kpi": RelationType.HAS_KPI,
            "has_value": RelationType.HAS_VALUE,
            "has_target": RelationType.HAS_TARGET,
            "has_baseline": RelationType.HAS_BASELINE,
            "has_unit": RelationType.HAS_UNIT,
            "measured_in": RelationType.MEASURED_IN,
            "supports": RelationType.SUPPORTS,
            "related_to": RelationType.RELATED_TO,
            "reduces": RelationType.REDUCES,
            "increases": RelationType.INCREASES,
            "belongs_to": RelationType.BELONGS_TO_SEGMENT,
        }
        return mappings.get(rel_str.lower().replace(" ", "_"))
