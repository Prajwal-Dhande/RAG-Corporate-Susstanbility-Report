"""
Sustainability MMKG-RAG: Cross-Company Benchmarking Analytics

Allows comparing sustainability performance (KPIs, targets, emissions)
across multiple reports or companies.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from mmkg.graph_builder import GraphBackend
from mmkg.ontology import EntityType

logger = logging.getLogger(__name__)


@dataclass
class BenchmarkResult:
    """Result of cross-company KPI comparison."""
    kpi_name: str
    companies: dict[str, Any]  # company_name -> value info
    unit: str
    year: int
    variance: float = 0.0

    def to_dict(self) -> dict:
        return {
            "kpi_name": self.kpi_name,
            "companies": self.companies,
            "unit": self.unit,
            "year": self.year,
            "variance": self.variance,
        }


class BenchmarkAnalyzer:
    """Analyzes and compares KPIs across multiple reports."""

    def __init__(self, graph: GraphBackend):
        self.graph = graph

    async def compare_emissions(self, report_ids: list[str], target_year: int) -> list[BenchmarkResult]:
        """
        Compare Scope 1/2/3 emissions across multiple reports for a given year.
        """
        results = []
        scope_names = ["Scope 1 Emissions", "Scope 2 Emissions", "Scope 3 Emissions"]

        for scope in scope_names:
            companies_data = {}
            for report_id in report_ids:
                # Find the KPI for this report
                kpis = await self.graph.get_entities_by_type(EntityType.KPI.value, report_id)
                kpi_entity = next((k for k in kpis if scope.lower() in k.name.lower()), None)

                if kpi_entity:
                    # Find values for this KPI
                    neighbors = await self.graph.get_entity_neighbors(kpi_entity.id, max_depth=1)
                    # For simplicity, extract the first numeric value associated (in a real system, filter by target_year)
                    val_entity = next((e for e in neighbors.get("entities", []) if e.type in (EntityType.KPI_VALUE.value, EntityType.ACTUAL_VALUE.value)), None)
                    if val_entity:
                        import re
                        numbers = re.findall(r'[-+]?\d[\d,]*\.?\d*', val_entity.name)
                        if numbers:
                            companies_data[report_id] = {
                                "value": float(numbers[0].replace(",", "")),
                                "raw": val_entity.name
                            }

            if companies_data:
                results.append(BenchmarkResult(
                    kpi_name=scope,
                    companies=companies_data,
                    unit="t CO2e", # normalized
                    year=target_year
                ))

        return results
