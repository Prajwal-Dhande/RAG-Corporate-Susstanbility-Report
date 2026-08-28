"""
Sustainability MMKG-RAG: Multi-Year Longitudinal Analytics

Analyzes KPI trends across multiple reports for a single company over time.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from mmkg.graph_builder import GraphBackend
from mmkg.ontology import EntityType
from reasoning.temporal import TemporalReasoner, TimeSeriesPoint, FiscalPeriod

logger = logging.getLogger(__name__)


@dataclass
class LongitudinalResult:
    """Result of multi-year KPI analysis."""
    kpi_name: str
    trend_direction: str
    data_points: list[dict]
    cagr: float | None = None

    def to_dict(self) -> dict:
        return {
            "kpi_name": self.kpi_name,
            "trend_direction": self.trend_direction,
            "data_points": self.data_points,
            "cagr": self.cagr,
        }


class LongitudinalAnalyzer:
    """Extracts and analyzes trends for a company across multiple years."""

    def __init__(self, graph: GraphBackend):
        self.graph = graph
        self.temporal = TemporalReasoner()

    async def analyze_company_trends(
        self,
        company_name: str,
        reports: list[dict], # list of dicts with id, fiscal_year
    ) -> list[LongitudinalResult]:
        """
        Analyze trends for core KPIs across a list of reports.
        """
        results = []
        kpis_to_track = ["Scope 1 Emissions", "Scope 2 Emissions", "Scope 3 Emissions", "Total Energy Consumption"]

        for kpi_name in kpis_to_track:
            time_series = []

            for report in reports:
                if not report.get("fiscal_year"):
                    continue
                    
                report_id = report["id"]
                year = report["fiscal_year"]
                
                # Find KPI in this report
                kpis = await self.graph.get_entities_by_type(EntityType.KPI.value, report_id)
                kpi_entity = next((k for k in kpis if kpi_name.lower() in k.name.lower()), None)
                
                if kpi_entity:
                    neighbors = await self.graph.get_entity_neighbors(kpi_entity.id, max_depth=1)
                    val_entity = next((e for e in neighbors.get("entities", []) if e.type in (EntityType.KPI_VALUE.value, EntityType.ACTUAL_VALUE.value)), None)
                    if val_entity:
                        import re
                        numbers = re.findall(r'[-+]?\d[\d,]*\.?\d*', val_entity.name)
                        if numbers:
                            val = float(numbers[0].replace(",", ""))
                            time_series.append(TimeSeriesPoint(
                                period=FiscalPeriod(year=year, label=f"FY{year}"),
                                value=val,
                                unit="auto"
                            ))
            
            if len(time_series) >= 2:
                trend = self.temporal.analyze_trend(kpi_name, time_series)
                results.append(LongitudinalResult(
                    kpi_name=kpi_name,
                    trend_direction=trend.trend_direction,
                    data_points=[
                        {"year": dp.period.year, "value": dp.value}
                        for dp in trend.data_points
                    ],
                    cagr=trend.cagr
                ))

        return results
