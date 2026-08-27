"""
Sustainability MMKG-RAG: Evaluation Framework

Benchmark dataset, metrics, baselines, and ablation configuration.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────
# Benchmark Dataset (Section 29)
# ──────────────────────────────────────────────

BENCHMARK_QUESTIONS = [
    {
        "id": "Q001",
        "report": "sample_sustainability_2024.pdf",
        "analysis_type": "target_progress",
        "question": "What is the company's GHG emission reduction target and current progress?",
        "expected_result": {
            "target": 50,
            "unit": "percent reduction",
            "baseline_year": 2020,
            "status": "behind"
        },
        "supporting_pages": [],
        "reasoning_path": ["Target", "Baseline", "KPI", "CurrentValue", "Gap", "Status"],
        "category": "target_analysis"
    },
    {
        "id": "Q002",
        "report": "sample_sustainability_2024.pdf",
        "analysis_type": "kpi_extraction",
        "question": "What are the Scope 1, 2, and 3 emissions reported?",
        "expected_result": {
            "kpi_name": "GHG Emissions",
            "scopes": ["Scope 1", "Scope 2", "Scope 3"]
        },
        "supporting_pages": [],
        "reasoning_path": ["KPI", "EmissionScope", "Value", "Unit"],
        "category": "kpi_extraction"
    },
    {
        "id": "Q003",
        "report": "sample_sustainability_2024.pdf",
        "analysis_type": "trend_analysis",
        "question": "How has total energy consumption changed over the reported years?",
        "expected_result": {
            "kpi_name": "Total Energy Consumption",
            "trend": "decreasing"
        },
        "supporting_pages": [],
        "reasoning_path": ["KPI", "FiscalPeriod", "Values", "Trend"],
        "category": "trend_analysis"
    },
    {
        "id": "Q004",
        "report": "sample_sustainability_2024.pdf",
        "analysis_type": "consistency",
        "question": "Are the emissions values consistent across text, tables, and charts?",
        "expected_result": {
            "status": "CONSISTENT"
        },
        "supporting_pages": [],
        "reasoning_path": ["KPI", "TextSource", "TableSource", "ChartSource", "Compare"],
        "category": "consistency_check"
    },
    {
        "id": "Q005",
        "report": "sample_sustainability_2024.pdf",
        "analysis_type": "temporal",
        "question": "What is the year-over-year change in renewable energy share?",
        "expected_result": {
            "kpi_name": "Renewable Energy Share",
            "direction": "increasing"
        },
        "supporting_pages": [],
        "reasoning_path": ["KPI", "FiscalPeriod", "YoYChange"],
        "category": "temporal_reasoning"
    },
]


def save_benchmark(path: Path = Path("data/benchmark/sustainability_benchmark.json")):
    """Save the benchmark dataset to JSON."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(BENCHMARK_QUESTIONS, f, indent=2)
    logger.info(f"Saved {len(BENCHMARK_QUESTIONS)} benchmark questions to {path}")


# ──────────────────────────────────────────────
# Evaluation Metrics (Section 28)
# ──────────────────────────────────────────────

@dataclass
class ExtractionMetrics:
    """Metrics for entity/relation extraction quality."""
    entity_precision: float = 0.0
    entity_recall: float = 0.0
    entity_f1: float = 0.0
    relation_precision: float = 0.0
    relation_recall: float = 0.0
    relation_f1: float = 0.0
    grounding_accuracy: float = 0.0

    def to_dict(self) -> dict:
        return {
            "entity_precision": self.entity_precision,
            "entity_recall": self.entity_recall,
            "entity_f1": self.entity_f1,
            "relation_precision": self.relation_precision,
            "relation_recall": self.relation_recall,
            "relation_f1": self.relation_f1,
            "grounding_accuracy": self.grounding_accuracy,
        }


@dataclass
class RetrievalMetrics:
    """Metrics for retrieval quality."""
    recall_at_k: dict[int, float] = field(default_factory=dict)
    precision_at_k: dict[int, float] = field(default_factory=dict)
    mrr: float = 0.0
    ndcg: float = 0.0

    def to_dict(self) -> dict:
        return {
            "recall_at_k": self.recall_at_k,
            "precision_at_k": self.precision_at_k,
            "mrr": self.mrr,
            "ndcg": self.ndcg,
        }


@dataclass
class ReasoningMetrics:
    """Metrics for reasoning quality."""
    target_status_accuracy: float = 0.0
    numerical_accuracy: float = 0.0
    temporal_accuracy: float = 0.0
    graph_path_correctness: float = 0.0

    def to_dict(self) -> dict:
        return {
            "target_status_accuracy": self.target_status_accuracy,
            "numerical_accuracy": self.numerical_accuracy,
            "temporal_accuracy": self.temporal_accuracy,
            "graph_path_correctness": self.graph_path_correctness,
        }


@dataclass
class EndToEndMetrics:
    """End-to-end evaluation metrics."""
    faithfulness: float = 0.0
    completeness: float = 0.0
    evidence_coverage: float = 0.0
    analytical_correctness: float = 0.0

    def to_dict(self) -> dict:
        return {
            "faithfulness": self.faithfulness,
            "completeness": self.completeness,
            "evidence_coverage": self.evidence_coverage,
            "analytical_correctness": self.analytical_correctness,
        }


def compute_f1(precision: float, recall: float) -> float:
    """Compute F1 score from precision and recall."""
    if precision + recall == 0:
        return 0.0
    return 2 * (precision * recall) / (precision + recall)


def compute_precision_at_k(relevant: set, retrieved: list, k: int) -> float:
    """Precision@K for retrieval evaluation."""
    if k == 0:
        return 0.0
    top_k = retrieved[:k]
    hits = sum(1 for item in top_k if item in relevant)
    return hits / k


def compute_recall_at_k(relevant: set, retrieved: list, k: int) -> float:
    """Recall@K for retrieval evaluation."""
    if len(relevant) == 0:
        return 0.0
    top_k = retrieved[:k]
    hits = sum(1 for item in top_k if item in relevant)
    return hits / len(relevant)


def compute_mrr(relevant: set, retrieved: list) -> float:
    """Mean Reciprocal Rank."""
    for i, item in enumerate(retrieved):
        if item in relevant:
            return 1.0 / (i + 1)
    return 0.0


# ──────────────────────────────────────────────
# Ablation Configuration (Section 31)
# ──────────────────────────────────────────────

ABLATION_CONFIGS = {
    "full_system": {
        "use_multimodal": True,
        "use_graph": True,
        "use_hybrid_retrieval": True,
        "use_ppr": True,
        "use_reasoning": True,
        "use_consistency": True,
        "use_temporal": True,
    },
    "no_multimodal": {
        "use_multimodal": False,
        "use_graph": True,
        "use_hybrid_retrieval": True,
        "use_ppr": True,
        "use_reasoning": True,
        "use_consistency": True,
        "use_temporal": True,
    },
    "no_graph": {
        "use_multimodal": True,
        "use_graph": False,
        "use_hybrid_retrieval": True,
        "use_ppr": False,
        "use_reasoning": False,
        "use_consistency": True,
        "use_temporal": True,
    },
    "no_reasoning": {
        "use_multimodal": True,
        "use_graph": True,
        "use_hybrid_retrieval": True,
        "use_ppr": True,
        "use_reasoning": False,
        "use_consistency": False,
        "use_temporal": False,
    },
    "text_only_rag": {
        "use_multimodal": False,
        "use_graph": False,
        "use_hybrid_retrieval": False,
        "use_ppr": False,
        "use_reasoning": False,
        "use_consistency": False,
        "use_temporal": False,
    },
}
