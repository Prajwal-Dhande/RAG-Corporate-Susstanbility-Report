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

    async def compare_all_kpis(self, report_ids: list[str]) -> list[BenchmarkResult]:
        """
        Compare all available KPIs across multiple reports by fetching real data from the Graph Database.
        """
        results = []
        all_kpis_by_report = {}
        
        for rid in report_ids:
            kpis = await self.graph.get_entities_by_type(EntityType.KPI.value, rid)
            all_kpis_by_report[rid] = kpis
            
        grouped_data = {}
        
        for rid, kpis in all_kpis_by_report.items():
            for k in kpis:
                n_name = k.name.lower()
                cat = k.name
                # Normalize common KPI names for grouping across reports
                if "scope 1" in n_name: cat = "Scope 1 Emissions"
                elif "scope 2" in n_name: cat = "Scope 2 Emissions"
                elif "scope 3" in n_name: cat = "Scope 3 Emissions"
                elif "energy" in n_name: cat = "Energy Consumption"
                elif "water" in n_name: cat = "Water Usage"
                elif "waste" in n_name: cat = "Waste Generation"
                elif "diversity" in n_name: cat = "Diversity & Inclusion"
                
                neighbors = await self.graph.get_entity_neighbors(k.id, max_depth=1)
                val_entity = next((e for e in neighbors.get("entities", []) if e.type in (EntityType.KPI_VALUE.value, EntityType.ACTUAL_VALUE.value)), None)
                
                if val_entity:
                    import re
                    numbers = re.findall(r'[-+]?\d[\d,]*\.?\d*', val_entity.name)
                    if numbers:
                        if cat not in grouped_data:
                            grouped_data[cat] = {}
                        grouped_data[cat][rid] = {
                            "value": float(numbers[0].replace(",", "")),
                            "raw": val_entity.name
                        }

        for kpi_name, companies_data in grouped_data.items():
            results.append(BenchmarkResult(
                kpi_name=kpi_name,
                companies=companies_data,
                unit="Metric Units",
                year=2024
            ))

        return results
