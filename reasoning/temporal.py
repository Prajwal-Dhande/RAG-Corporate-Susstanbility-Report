"""
Sustainability MMKG-RAG: Temporal Reasoning Engine

Handles fiscal period representation, YoY change, trend detection,
target progression, deadline comparison, and period alignment.

PROJECT-SPECIFIC EXTENSION.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class FiscalPeriod:
    """Represents a fiscal time period."""
    year: int
    quarter: Optional[int] = None  # 1-4, None = full year
    label: str = ""

    @property
    def sort_key(self) -> float:
        """Sortable key for chronological ordering."""
        return self.year + (self.quarter or 0) / 10.0

    def __str__(self):
        if self.quarter:
            return f"Q{self.quarter} FY{self.year}"
        return f"FY{self.year}"


@dataclass
class TimeSeriesPoint:
    """A data point in a time series."""
    period: FiscalPeriod
    value: float
    unit: str = ""
    source_page: int = -1
    confidence: float = 0.0


@dataclass
class TrendResult:
    """Result of trend analysis."""
    kpi_name: str
    data_points: list[TimeSeriesPoint] = field(default_factory=list)
    trend_direction: str = "unknown"  # increasing, decreasing, stable, volatile
    yoy_changes: list[dict] = field(default_factory=list)
    cagr: Optional[float] = None  # Compound annual growth rate
    missing_years: list[int] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "kpi_name": self.kpi_name,
            "data_points": [
                {
                    "year": dp.period.year,
                    "quarter": dp.period.quarter,
                    "value": dp.value,
                    "unit": dp.unit,
                    "source_page": dp.source_page,
                }
                for dp in self.data_points
            ],
            "trend_direction": self.trend_direction,
            "yoy_changes": self.yoy_changes,
            "cagr": self.cagr,
            "missing_years": self.missing_years,
        }


def parse_fiscal_period(text: str) -> Optional[FiscalPeriod]:
    """Parse a text string into a FiscalPeriod."""
    text = text.strip()

    # "FY2024", "FY 2024"
    m = re.match(r'FY\s*(\d{4})', text, re.IGNORECASE)
    if m:
        return FiscalPeriod(year=int(m.group(1)), label=text)

    # "Q3 2024", "Q3 FY2024"
    m = re.match(r'Q([1-4])\s*(?:FY)?\s*(\d{4})', text, re.IGNORECASE)
    if m:
        return FiscalPeriod(year=int(m.group(2)), quarter=int(m.group(1)), label=text)

    # Plain year "2024"
    m = re.match(r'^(\d{4})$', text)
    if m:
        year = int(m.group(1))
        if 1990 <= year <= 2100:
            return FiscalPeriod(year=year, label=text)

    return None


class TemporalReasoner:
    """
    Performs temporal reasoning over sustainability KPI time series.

    All calculations are deterministic Python — the LLM does NOT compute.
    """

    def compute_yoy_changes(
        self,
        data_points: list[TimeSeriesPoint],
    ) -> list[dict]:
        """
        Compute year-over-year changes. Deterministic arithmetic.
        """
        sorted_points = sorted(data_points, key=lambda dp: dp.period.sort_key)
        changes = []

        for i in range(1, len(sorted_points)):
            prev = sorted_points[i - 1]
            curr = sorted_points[i]

            absolute_change = curr.value - prev.value
            percent_change = None
            if prev.value != 0:
                percent_change = (absolute_change / abs(prev.value)) * 100

            changes.append({
                "from_year": prev.period.year,
                "to_year": curr.period.year,
                "from_value": prev.value,
                "to_value": curr.value,
                "absolute_change": round(absolute_change, 4),
                "percent_change": round(percent_change, 2) if percent_change is not None else None,
            })

        return changes

    def detect_trend(
        self,
        data_points: list[TimeSeriesPoint],
    ) -> str:
        """
        Detect overall trend direction. Deterministic.

        Returns: increasing, decreasing, stable, volatile, insufficient_data
        """
        if len(data_points) < 2:
            return "insufficient_data"

        sorted_points = sorted(data_points, key=lambda dp: dp.period.sort_key)
        values = [dp.value for dp in sorted_points]

        # Count direction changes
        increases = 0
        decreases = 0
        for i in range(1, len(values)):
            if values[i] > values[i - 1]:
                increases += 1
            elif values[i] < values[i - 1]:
                decreases += 1

        total_transitions = increases + decreases
        if total_transitions == 0:
            return "stable"

        increase_ratio = increases / total_transitions

        if increase_ratio >= 0.8:
            return "increasing"
        elif increase_ratio <= 0.2:
            return "decreasing"
        elif 0.35 <= increase_ratio <= 0.65 and total_transitions >= 3:
            return "volatile"
        elif increase_ratio > 0.5:
            return "increasing"
        else:
            return "decreasing"

    def compute_cagr(
        self,
        start_value: float,
        end_value: float,
        years: int,
    ) -> Optional[float]:
        """
        Compute Compound Annual Growth Rate. Deterministic.

        CAGR = (end/start)^(1/years) - 1
        """
        if start_value <= 0 or end_value <= 0 or years <= 0:
            return None
        return (end_value / start_value) ** (1 / years) - 1

    def find_missing_years(
        self,
        data_points: list[TimeSeriesPoint],
    ) -> list[int]:
        """
        Find gaps in the time series. Does NOT hallucinate missing values.
        """
        if len(data_points) < 2:
            return []

        years = sorted(set(dp.period.year for dp in data_points))
        missing = []
        for y in range(years[0], years[-1] + 1):
            if y not in years:
                missing.append(y)
        return missing

    def analyze_trend(
        self,
        kpi_name: str,
        data_points: list[TimeSeriesPoint],
    ) -> TrendResult:
        """Full trend analysis for a KPI time series."""
        yoy = self.compute_yoy_changes(data_points)
        direction = self.detect_trend(data_points)
        missing = self.find_missing_years(data_points)

        cagr = None
        sorted_points = sorted(data_points, key=lambda dp: dp.period.sort_key)
        if len(sorted_points) >= 2:
            start = sorted_points[0]
            end = sorted_points[-1]
            year_span = end.period.year - start.period.year
            if year_span > 0:
                cagr = self.compute_cagr(start.value, end.value, year_span)

        return TrendResult(
            kpi_name=kpi_name,
            data_points=sorted_points,
            trend_direction=direction,
            yoy_changes=yoy,
            cagr=cagr,
            missing_years=missing,
        )

    def compare_to_deadline(
        self,
        current_year: int,
        deadline_year: int,
        current_progress: float,  # 0-100%
    ) -> dict:
        """
        Assess whether current progress is sufficient to meet the deadline.
        Deterministic calculation.
        """
        years_remaining = deadline_year - current_year
        progress_remaining = 100.0 - current_progress

        if years_remaining <= 0:
            status = "achieved" if current_progress >= 100 else "missed"
            return {
                "status": status,
                "years_remaining": 0,
                "progress_remaining": progress_remaining,
                "required_annual_progress": None,
            }

        required_annual = progress_remaining / years_remaining

        # Heuristic: if required pace > 2× average past pace → likely behind
        status = "on_track"
        if progress_remaining <= 0:
            status = "achieved"
        elif required_annual > 15:  # Very aggressive pace needed
            status = "at_risk"
        elif required_annual > 10:
            status = "behind"

        return {
            "status": status,
            "years_remaining": years_remaining,
            "progress_remaining": round(progress_remaining, 2),
            "required_annual_progress": round(required_annual, 2),
            "deadline_year": deadline_year,
        }
