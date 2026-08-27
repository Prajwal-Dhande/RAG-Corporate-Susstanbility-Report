"""
Sustainability MMKG-RAG: Cross-Page Entity Resolution

Links recurring entities across pages to avoid duplicate nodes.
Uses embedding similarity + optional VLM comparison.

REFERENCE-INSPIRED: Cross-page entity connection from KG4VD.
PROJECT-SPECIFIC: Sustainability-domain canonicalization rules.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Optional

import numpy as np

from mmkg.ontology import EntityType, GraphEntity, GraphRelation, RelationType

logger = logging.getLogger(__name__)


@dataclass
class ResolutionResult:
    """Result of comparing two entities."""
    entity_a_id: str
    entity_b_id: str
    decision: str  # same_entity, related_entity, unrelated
    confidence: float
    canonical_name: Optional[str] = None
    reasoning: str = ""


# Common sustainability aliases
KNOWN_ALIASES = {
    "scope 1": ["scope i", "direct emissions", "scope one"],
    "scope 2": ["scope ii", "indirect energy emissions", "scope two", "indirect electricity emissions"],
    "scope 3": ["scope iii", "value chain emissions", "scope three", "other indirect emissions"],
    "ghg emissions": ["greenhouse gas emissions", "total ghg", "carbon emissions", "co2 emissions", "co2e emissions"],
    "net zero": ["net-zero", "carbon neutral", "carbon neutrality"],
    "renewable energy": ["clean energy", "green energy", "renewables"],
    "total energy consumption": ["energy consumption", "total energy use", "energy usage"],
    "water consumption": ["water usage", "total water", "water withdrawal"],
    "waste generated": ["total waste", "waste generation", "waste produced"],
}


def normalize_entity_name(name: str) -> str:
    """Normalize an entity name for comparison."""
    normalized = name.lower().strip()
    normalized = re.sub(r'\s+', ' ', normalized)
    normalized = re.sub(r'[^\w\s]', '', normalized)
    return normalized


def check_known_alias(name_a: str, name_b: str) -> Optional[str]:
    """Check if two names are known aliases of each other."""
    norm_a = normalize_entity_name(name_a)
    norm_b = normalize_entity_name(name_b)

    if norm_a == norm_b:
        return "exact_match"

    for canonical, aliases in KNOWN_ALIASES.items():
        all_forms = [canonical] + aliases
        all_forms_norm = [normalize_entity_name(f) for f in all_forms]
        a_match = any(norm_a in f or f in norm_a for f in all_forms_norm)
        b_match = any(norm_b in f or f in norm_b for f in all_forms_norm)
        if a_match and b_match:
            return canonical

    return None


class EntityResolver:
    """
    Resolves entities across pages to prevent duplicate nodes.

    Pipeline:
    1. Candidate retrieval (same type entities)
    2. Name normalization + alias check
    3. Embedding similarity
    4. Resolution decision
    5. Canonicalization (merge or link)
    """

    def __init__(self, similarity_threshold: float = 0.85):
        self.similarity_threshold = similarity_threshold
        self.resolutions: list[ResolutionResult] = []

    def resolve_entities(
        self,
        entities: list[GraphEntity],
        embeddings: Optional[np.ndarray] = None,
    ) -> tuple[list[GraphEntity], list[GraphRelation]]:
        """
        Resolve duplicates among entities.

        Returns:
            (canonical_entities, same_entity_relations)
        """
        if len(entities) <= 1:
            return entities, []

        # Group by type
        type_groups: dict[str, list[int]] = {}
        for i, entity in enumerate(entities):
            etype = entity.type.value if isinstance(entity.type, EntityType) else entity.type
            type_groups.setdefault(etype, []).append(i)

        merged_ids: set[int] = set()
        canonical_map: dict[int, int] = {}  # merged_idx → canonical_idx
        same_entity_relations: list[GraphRelation] = []

        for entity_type, indices in type_groups.items():
            if len(indices) <= 1:
                continue

            for i_pos in range(len(indices)):
                idx_a = indices[i_pos]
                if idx_a in merged_ids:
                    continue

                for j_pos in range(i_pos + 1, len(indices)):
                    idx_b = indices[j_pos]
                    if idx_b in merged_ids:
                        continue

                    entity_a = entities[idx_a]
                    entity_b = entities[idx_b]

                    # Check known aliases
                    alias = check_known_alias(entity_a.name, entity_b.name)
                    if alias:
                        result = ResolutionResult(
                            entity_a_id=entity_a.id,
                            entity_b_id=entity_b.id,
                            decision="same_entity",
                            confidence=0.95 if alias == "exact_match" else 0.85,
                            canonical_name=alias if alias != "exact_match" else entity_a.name,
                            reasoning=f"Known alias match: {alias}",
                        )
                        self.resolutions.append(result)
                        merged_ids.add(idx_b)
                        canonical_map[idx_b] = idx_a
                        self._merge_entity(entities[idx_a], entities[idx_b])
                        continue

                    # Embedding similarity
                    if embeddings is not None:
                        sim = float(np.dot(embeddings[idx_a], embeddings[idx_b]))
                        if sim >= self.similarity_threshold:
                            result = ResolutionResult(
                                entity_a_id=entity_a.id,
                                entity_b_id=entity_b.id,
                                decision="same_entity",
                                confidence=sim,
                                canonical_name=entity_a.name,
                                reasoning=f"Embedding similarity: {sim:.3f}",
                            )
                            self.resolutions.append(result)
                            merged_ids.add(idx_b)
                            canonical_map[idx_b] = idx_a
                            self._merge_entity(entities[idx_a], entities[idx_b])
                        elif sim >= 0.7:
                            # Related but not same
                            same_entity_relations.append(GraphRelation(
                                id=f"rel_{entity_a.id}_{entity_b.id}",
                                source_id=entity_a.id,
                                relation=RelationType.RELATED_TO,
                                target_id=entity_b.id,
                                confidence=sim,
                                description=f"Related entities (similarity: {sim:.3f})",
                                report_id=entity_a.report_id,
                            ))

        # Build canonical entity list
        canonical_entities = [e for i, e in enumerate(entities) if i not in merged_ids]

        logger.info(
            f"Entity resolution: {len(entities)} → {len(canonical_entities)} entities "
            f"({len(merged_ids)} merged, {len(same_entity_relations)} related links)"
        )

        return canonical_entities, same_entity_relations

    def _merge_entity(self, canonical: GraphEntity, duplicate: GraphEntity) -> None:
        """Merge duplicate entity data into the canonical entity."""
        # Merge page numbers
        for p in duplicate.page_numbers:
            if p not in canonical.page_numbers:
                canonical.page_numbers.append(p)

        # Merge source component IDs
        for c in duplicate.source_component_ids:
            if c not in canonical.source_component_ids:
                canonical.source_component_ids.append(c)

        # Use higher confidence
        canonical.confidence = max(canonical.confidence, duplicate.confidence)

        # Merge description if canonical has none
        if not canonical.description and duplicate.description:
            canonical.description = duplicate.description

        # Merge properties
        for k, v in duplicate.properties.items():
            if k not in canonical.properties:
                canonical.properties[k] = v
