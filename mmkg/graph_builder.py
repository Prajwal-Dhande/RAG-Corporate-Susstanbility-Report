"""
Sustainability MMKG-RAG: Knowledge Graph Builder

Builds and manages the knowledge graph using NetworkX (dev) or Neo4j (production).
Provides a unified interface for graph operations.

REFERENCE-INSPIRED: Grounded page-level MMKG from KG4VD.
PROJECT-SPECIFIC: Sustainability ontology enforcement, provenance tracking.
"""

from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Optional

import networkx as nx

from backend.app.config import get_settings
from mmkg.ontology import (
    EntityType,
    ExtractionResult,
    GraphEntity,
    GraphRelation,
    RelationType,
)

logger = logging.getLogger(__name__)


class GraphBackend(ABC):
    """Abstract graph backend interface."""

    @abstractmethod
    async def add_entity(self, entity: GraphEntity) -> str:
        ...

    @abstractmethod
    async def add_relation(self, relation: GraphRelation) -> str:
        ...

    @abstractmethod
    async def get_entity(self, entity_id: str) -> Optional[GraphEntity]:
        ...

    @abstractmethod
    async def get_entities_by_type(self, entity_type: str, report_id: Optional[str] = None) -> list[GraphEntity]:
        ...

    @abstractmethod
    async def get_entity_neighbors(self, entity_id: str, max_depth: int = 1) -> dict:
        ...

    @abstractmethod
    async def get_all_entities(self, report_id: Optional[str] = None) -> list[GraphEntity]:
        ...

    @abstractmethod
    async def get_all_relations(self, report_id: Optional[str] = None) -> list[GraphRelation]:
        ...

    @abstractmethod
    async def search_entities(self, query: str, entity_type: Optional[str] = None) -> list[GraphEntity]:
        ...

    @abstractmethod
    async def get_paths(self, source_id: str, target_id: str, max_length: int = 5) -> list[list[dict]]:
        ...

    @abstractmethod
    async def clear_report(self, report_id: str) -> int:
        ...

    @abstractmethod
    async def get_stats(self, report_id: Optional[str] = None) -> dict:
        ...

    @abstractmethod
    async def save(self) -> None:
        ...


class NetworkXBackend(GraphBackend):
    """
    NetworkX-based in-memory graph backend for development.
    Persists to JSON files for durability.
    """

    def __init__(self, storage_path: Optional[str] = None):
        settings = get_settings()
        self.storage_path = Path(storage_path or settings.local_storage_path) / "graph"
        self.storage_path.mkdir(parents=True, exist_ok=True)
        self.graph = nx.MultiDiGraph()
        self._load()

    def _load(self):
        """Load graph from JSON files."""
        nodes_file = self.storage_path / "nodes.json"
        edges_file = self.storage_path / "edges.json"

        if nodes_file.exists():
            try:
                with open(nodes_file) as f:
                    nodes = json.load(f)
                for node_data in nodes:
                    node_id = node_data.pop("_id")
                    self.graph.add_node(node_id, **node_data)
            except Exception as e:
                logger.warning(f"Failed to load nodes: {e}")

        if edges_file.exists():
            try:
                with open(edges_file) as f:
                    edges = json.load(f)
                for edge_data in edges:
                    src = edge_data.pop("_source")
                    tgt = edge_data.pop("_target")
                    self.graph.add_edge(src, tgt, **edge_data)
            except Exception as e:
                logger.warning(f"Failed to load edges: {e}")

        logger.info(f"Loaded graph: {self.graph.number_of_nodes()} nodes, {self.graph.number_of_edges()} edges")

    async def save(self):
        """Persist graph to JSON files."""
        nodes = []
        for node_id, data in self.graph.nodes(data=True):
            node_data = {"_id": node_id}
            node_data.update(data)
            nodes.append(node_data)

        edges = []
        for src, tgt, data in self.graph.edges(data=True):
            edge_data = {"_source": src, "_target": tgt}
            edge_data.update(data)
            edges.append(edge_data)

        with open(self.storage_path / "nodes.json", "w") as f:
            json.dump(nodes, f, indent=2, default=str)

        with open(self.storage_path / "edges.json", "w") as f:
            json.dump(edges, f, indent=2, default=str)

    async def add_entity(self, entity: GraphEntity) -> str:
        self.graph.add_node(
            entity.id,
            name=entity.name,
            type=entity.type.value if isinstance(entity.type, EntityType) else entity.type,
            modality=entity.modality,
            description=entity.description,
            source_component_ids=entity.source_component_ids,
            confidence=entity.confidence,
            properties=entity.properties,
            report_id=entity.report_id,
            page_numbers=entity.page_numbers,
            source_text=entity.source_text,
            extraction_method=entity.extraction_method,
            model_name=entity.model_name,
        )
        return entity.id

    async def add_relation(self, relation: GraphRelation) -> str:
        self.graph.add_edge(
            relation.source_id,
            relation.target_id,
            id=relation.id,
            relation=relation.relation.value if isinstance(relation.relation, RelationType) else relation.relation,
            description=relation.description,
            source_component_ids=relation.source_component_ids,
            confidence=relation.confidence,
            properties=relation.properties,
            report_id=relation.report_id,
            page_numbers=relation.page_numbers,
        )
        return relation.id

    async def get_entity(self, entity_id: str) -> Optional[GraphEntity]:
        if entity_id not in self.graph:
            return None
        data = self.graph.nodes[entity_id]
        return self._node_to_entity(entity_id, data)

    async def get_entities_by_type(self, entity_type: str, report_id: Optional[str] = None) -> list[GraphEntity]:
        result = []
        for node_id, data in self.graph.nodes(data=True):
            if data.get("type") == entity_type:
                if report_id is None or data.get("report_id") == report_id:
                    result.append(self._node_to_entity(node_id, data))
        return result

    async def get_entity_neighbors(self, entity_id: str, max_depth: int = 1) -> dict:
        if entity_id not in self.graph:
            return {"entities": [], "relations": []}

        visited = set()
        entities = []
        relations = []

        def _traverse(node_id, depth):
            if depth > max_depth or node_id in visited:
                return
            visited.add(node_id)

            if node_id in self.graph:
                data = self.graph.nodes[node_id]
                entities.append(self._node_to_entity(node_id, data))

            for _, target, edge_data in self.graph.edges(node_id, data=True):
                relations.append({
                    "source_id": node_id,
                    "target_id": target,
                    "relation": edge_data.get("relation", ""),
                    "confidence": edge_data.get("confidence", 0),
                })
                _traverse(target, depth + 1)

            for source, _, edge_data in self.graph.in_edges(node_id, data=True):
                relations.append({
                    "source_id": source,
                    "target_id": node_id,
                    "relation": edge_data.get("relation", ""),
                    "confidence": edge_data.get("confidence", 0),
                })
                _traverse(source, depth + 1)

        _traverse(entity_id, 0)
        return {"entities": entities, "relations": relations}

    async def get_all_entities(self, report_id: Optional[str] = None) -> list[GraphEntity]:
        result = []
        for node_id, data in self.graph.nodes(data=True):
            if report_id is None or data.get("report_id") == report_id:
                result.append(self._node_to_entity(node_id, data))
        return result

    async def get_all_relations(self, report_id: Optional[str] = None) -> list[GraphRelation]:
        result = []
        for src, tgt, data in self.graph.edges(data=True):
            if report_id is None or data.get("report_id") == report_id:
                result.append(self._edge_to_relation(src, tgt, data))
        return result

    async def search_entities(self, query: str, entity_type: Optional[str] = None) -> list[GraphEntity]:
        query_lower = query.lower()
        result = []
        for node_id, data in self.graph.nodes(data=True):
            if entity_type and data.get("type") != entity_type:
                continue
            name = data.get("name", "").lower()
            desc = data.get("description", "").lower()
            if query_lower in name or query_lower in desc:
                result.append(self._node_to_entity(node_id, data))
        return result

    async def get_paths(self, source_id: str, target_id: str, max_length: int = 5) -> list[list[dict]]:
        try:
            paths = list(nx.all_simple_paths(self.graph, source_id, target_id, cutoff=max_length))
            result = []
            for path in paths[:10]:  # Limit to 10 paths
                path_info = []
                for i, node_id in enumerate(path):
                    data = self.graph.nodes[node_id]
                    path_info.append({
                        "id": node_id,
                        "name": data.get("name", ""),
                        "type": data.get("type", ""),
                    })
                result.append(path_info)
            return result
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return []

    async def clear_report(self, report_id: str) -> int:
        nodes_to_remove = [
            n for n, d in self.graph.nodes(data=True)
            if d.get("report_id") == report_id
        ]
        self.graph.remove_nodes_from(nodes_to_remove)
        return len(nodes_to_remove)

    async def get_stats(self, report_id: Optional[str] = None) -> dict:
        if report_id:
            entities = await self.get_all_entities(report_id)
            relations = await self.get_all_relations(report_id)
        else:
            entities = list(self.graph.nodes(data=True))
            relations = list(self.graph.edges(data=True))

        type_counts = {}
        for e in (entities if report_id else [self._node_to_entity(n, d) for n, d in entities]):
            t = e.type if isinstance(e.type, str) else e.type.value
            type_counts[t] = type_counts.get(t, 0) + 1

        return {
            "entity_count": len(entities),
            "relation_count": len(relations),
            "entity_types": type_counts,
        }

    def _node_to_entity(self, node_id: str, data: dict) -> GraphEntity:
        entity_type = data.get("type", "KPI")
        try:
            entity_type = EntityType(entity_type)
        except ValueError:
            entity_type = EntityType.KPI

        return GraphEntity(
            id=node_id,
            name=data.get("name", ""),
            type=entity_type,
            modality=data.get("modality", "text"),
            description=data.get("description", ""),
            source_component_ids=data.get("source_component_ids", []),
            confidence=data.get("confidence", 0),
            properties=data.get("properties", {}),
            report_id=data.get("report_id", ""),
            page_numbers=data.get("page_numbers", []),
            source_text=data.get("source_text", ""),
            extraction_method=data.get("extraction_method", ""),
            model_name=data.get("model_name", ""),
        )

    def _edge_to_relation(self, src: str, tgt: str, data: dict) -> GraphRelation:
        rel_type = data.get("relation", "RELATED_TO")
        try:
            rel_type = RelationType(rel_type)
        except ValueError:
            rel_type = RelationType.RELATED_TO

        return GraphRelation(
            id=data.get("id", ""),
            source_id=src,
            relation=rel_type,
            target_id=tgt,
            description=data.get("description", ""),
            source_component_ids=data.get("source_component_ids", []),
            confidence=data.get("confidence", 0),
            properties=data.get("properties", {}),
            report_id=data.get("report_id", ""),
            page_numbers=data.get("page_numbers", []),
        )


def get_graph_backend() -> GraphBackend:
    """Factory: return the configured graph backend."""
    settings = get_settings()
    if settings.graph_backend == "neo4j":
        # TODO: Implement Neo4jBackend when Neo4j is available
        logger.warning("Neo4j backend not implemented, falling back to NetworkX")
        return NetworkXBackend()
    return NetworkXBackend()
