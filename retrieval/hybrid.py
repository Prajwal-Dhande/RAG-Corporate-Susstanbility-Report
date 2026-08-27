"""
Sustainability MMKG-RAG: Hybrid Retrieval System

Combines lexical, semantic, and graph retrieval with configurable weights.

REFERENCE-INSPIRED: Hybrid retrieval with page-anchored expansion from KG4VD.
PROJECT-SPECIFIC: Sustainability-aware scoring and evidence provenance.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any, Optional

import numpy as np

from backend.app.config import get_settings
from mmkg.graph_builder import GraphBackend
from retrieval.embeddings import EmbeddingIndex, EmbeddingProvider

logger = logging.getLogger(__name__)


@dataclass
class RetrievalResult:
    """A single retrieval result with combined score."""
    id: str
    type: str  # page, entity
    name: str = ""
    score: float = 0.0
    semantic_score: float = 0.0
    lexical_score: float = 0.0
    graph_score: float = 0.0
    modality_score: float = 0.0
    provenance_score: float = 0.0
    metadata: dict = field(default_factory=dict)
    page_numbers: list[int] = field(default_factory=list)


class LexicalRetriever:
    """
    Keyword/full-text retrieval for high-signal exact matches.
    Optimized for sustainability-specific terms.
    """

    # Sustainability-specific high-signal terms
    HIGH_SIGNAL_PATTERNS = [
        r"scope\s*[123]",
        r"net\s*zero",
        r"carbon\s*neutral",
        r"ghg\s*emission",
        r"renewable\s*energy",
        r"\d{4}\s*target",
        r"fy\s*\d{4}",
        r"mt\s*co2",
        r"kt\s*co2",
        r"sdg\s*\d+",
        r"gri\s+\d+",
    ]

    def __init__(self):
        self.documents: dict[str, dict] = {}  # id -> {text, metadata}

    def add_document(self, doc_id: str, text: str, metadata: Optional[dict] = None):
        """Add a document to the index."""
        self.documents[doc_id] = {
            "text": text.lower(),
            "text_original": text,
            "metadata": metadata or {},
        }

    def search(self, query: str, top_k: int = 10) -> list[tuple[str, float, dict]]:
        """Search using keyword matching with TF-based scoring."""
        query_lower = query.lower()
        query_terms = re.findall(r'\b\w+\b', query_lower)

        results = []
        for doc_id, doc in self.documents.items():
            text = doc["text"]
            score = 0.0

            # Term frequency scoring
            for term in query_terms:
                count = text.count(term)
                if count > 0:
                    # BM25-like scoring
                    tf = count / (count + 1.5)
                    score += tf

            # Bonus for high-signal pattern matches
            for pattern in self.HIGH_SIGNAL_PATTERNS:
                if re.search(pattern, query_lower) and re.search(pattern, text):
                    score += 2.0

            # Exact phrase match bonus
            if query_lower in text:
                score += 3.0

            if score > 0:
                results.append((doc_id, score, doc["metadata"]))

        # Normalize scores
        if results:
            max_score = max(r[1] for r in results)
            if max_score > 0:
                results = [(r[0], r[1] / max_score, r[2]) for r in results]

        results.sort(key=lambda x: x[1], reverse=True)
        return results[:top_k]


class HybridRetriever:
    """
    Combines lexical, semantic, and graph retrieval.

    final_score = α·semantic + β·lexical + γ·graph + δ·modality + ε·provenance
    """

    def __init__(
        self,
        embedding_provider: EmbeddingProvider,
        page_index: EmbeddingIndex,
        entity_index: EmbeddingIndex,
        lexical_retriever: LexicalRetriever,
        graph_backend: GraphBackend,
    ):
        self.embedding_provider = embedding_provider
        self.page_index = page_index
        self.entity_index = entity_index
        self.lexical = lexical_retriever
        self.graph = graph_backend

        settings = get_settings()
        self.alpha = settings.retrieval_alpha    # semantic
        self.beta = settings.retrieval_beta      # lexical
        self.gamma = settings.retrieval_gamma    # graph
        self.delta = settings.retrieval_delta    # modality
        self.epsilon = settings.retrieval_epsilon  # provenance

    async def retrieve(
        self,
        query: str,
        top_k: int = 10,
        entity_type: Optional[str] = None,
        report_id: Optional[str] = None,
    ) -> list[RetrievalResult]:
        """
        Perform hybrid retrieval combining all signals.

        Args:
            query: Search query
            top_k: Number of results
            entity_type: Optional filter by entity type
            report_id: Optional filter by report

        Returns:
            Ranked list of RetrievalResult
        """
        all_scores: dict[str, RetrievalResult] = {}

        # 1. Semantic retrieval
        try:
            query_embedding = self.embedding_provider.embed_query(query)

            # Search page index
            page_results = self.page_index.search(query_embedding[0], top_k=top_k * 2)
            for pid, score, meta in page_results:
                if report_id and meta.get("report_id") != report_id:
                    continue
                if pid not in all_scores:
                    all_scores[pid] = RetrievalResult(
                        id=pid, type="page", name=meta.get("name", ""),
                        metadata=meta, page_numbers=meta.get("page_numbers", []),
                    )
                all_scores[pid].semantic_score = score

            # Search entity index
            entity_results = self.entity_index.search(query_embedding[0], top_k=top_k * 2)
            for eid, score, meta in entity_results:
                if report_id and meta.get("report_id") != report_id:
                    continue
                if entity_type and meta.get("type") != entity_type:
                    continue
                if eid not in all_scores:
                    all_scores[eid] = RetrievalResult(
                        id=eid, type="entity", name=meta.get("name", ""),
                        metadata=meta, page_numbers=meta.get("page_numbers", []),
                    )
                all_scores[eid].semantic_score = score

        except Exception as e:
            logger.warning(f"Semantic retrieval failed: {e}")

        # 2. Lexical retrieval
        try:
            lexical_results = self.lexical.search(query, top_k=top_k * 2)
            for lid, score, meta in lexical_results:
                if report_id and meta.get("report_id") != report_id:
                    continue
                if lid not in all_scores:
                    all_scores[lid] = RetrievalResult(
                        id=lid, type=meta.get("type", "page"), name=meta.get("name", ""),
                        metadata=meta, page_numbers=meta.get("page_numbers", []),
                    )
                all_scores[lid].lexical_score = score
        except Exception as e:
            logger.warning(f"Lexical retrieval failed: {e}")

        # 3. Graph retrieval
        try:
            graph_entities = await self.graph.search_entities(query, entity_type)
            for entity in graph_entities[:top_k * 2]:
                if report_id and entity.report_id != report_id:
                    continue
                eid = entity.id
                if eid not in all_scores:
                    all_scores[eid] = RetrievalResult(
                        id=eid, type="entity", name=entity.name,
                        metadata=entity.to_dict(), page_numbers=entity.page_numbers,
                    )
                # Graph score based on confidence and connectivity
                all_scores[eid].graph_score = entity.confidence
        except Exception as e:
            logger.warning(f"Graph retrieval failed: {e}")

        # 4. Compute final scores
        for result in all_scores.values():
            result.score = (
                self.alpha * result.semantic_score
                + self.beta * result.lexical_score
                + self.gamma * result.graph_score
                + self.delta * result.modality_score
                + self.epsilon * result.provenance_score
            )

        # Sort and return top-K
        ranked = sorted(all_scores.values(), key=lambda r: r.score, reverse=True)
        return ranked[:top_k]
