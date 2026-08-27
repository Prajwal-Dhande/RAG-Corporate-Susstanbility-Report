"""
Sustainability MMKG-RAG: Unit Normalization Engine

Deterministic unit conversion for sustainability metrics.
Every conversion retains original_value, original_unit, normalized_value,
normalized_unit, and conversion_rule.

PROJECT-SPECIFIC EXTENSION.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class NormalizedValue:
    """A normalized value with full conversion provenance."""
    original_value: float
    original_unit: str
    normalized_value: float
    normalized_unit: str
    conversion_rule: str
    category: str  # emissions, energy, water, waste, etc.


# Conversion factors to base units
UNIT_CONVERSIONS = {
    # Emissions: base unit = t CO2e
    "emissions": {
        "t co2e": 1.0,
        "tco2e": 1.0,
        "tonnes co2e": 1.0,
        "tons co2e": 1.0,
        "kt co2e": 1000.0,
        "ktco2e": 1000.0,
        "mt co2e": 1_000_000.0,
        "mtco2e": 1_000_000.0,
        "million tonnes co2e": 1_000_000.0,
        "gt co2e": 1_000_000_000.0,
        "kg co2e": 0.001,
        "g co2e": 0.000001,
        "t co2": 1.0,
        "kt co2": 1000.0,
        "mt co2": 1_000_000.0,
    },
    # Energy: base unit = MWh
    "energy": {
        "mwh": 1.0,
        "kwh": 0.001,
        "gwh": 1000.0,
        "twh": 1_000_000.0,
        "gj": 0.277778,  # 1 GJ = 0.277778 MWh
        "tj": 277.778,
        "pj": 277778.0,
        "mj": 0.000277778,
        "btu": 0.000000293071,
        "mmbtu": 0.293071,
    },
    # Water: base unit = m³ (cubic meters)
    "water": {
        "m3": 1.0,
        "m³": 1.0,
        "cubic meters": 1.0,
        "liters": 0.001,
        "litres": 0.001,
        "l": 0.001,
        "ml": 0.000001,
        "million liters": 1000.0,
        "million litres": 1000.0,
        "ml (million liters)": 1000.0,
        "gallons": 0.00378541,
        "million gallons": 3785.41,
        "kl": 1.0,
        "megalitres": 1000.0,
    },
    # Waste: base unit = tonnes
    "waste": {
        "tonnes": 1.0,
        "tons": 1.0,
        "t": 1.0,
        "kt": 1000.0,
        "mt": 1_000_000.0,
        "kg": 0.001,
        "g": 0.000001,
    },
    # Percentage: base unit = %
    "percentage": {
        "%": 1.0,
        "percent": 1.0,
        "percentage": 1.0,
        "pct": 1.0,
    },
    # Currency: base unit = USD (approximate)
    "currency": {
        "usd": 1.0,
        "$": 1.0,
        "million usd": 1_000_000.0,
        "billion usd": 1_000_000_000.0,
        "m$": 1_000_000.0,
        "b$": 1_000_000_000.0,
    },
}

# Base units per category
BASE_UNITS = {
    "emissions": "t CO2e",
    "energy": "MWh",
    "water": "m³",
    "waste": "tonnes",
    "percentage": "%",
    "currency": "USD",
}


class UnitNormalizer:
    """
    Deterministic unit normalization engine.
    Converts sustainability metrics to standard base units.
    """

    def normalize(
        self,
        value: float,
        unit: str,
        category: Optional[str] = None,
    ) -> Optional[NormalizedValue]:
        """
        Normalize a value to the base unit for its category.

        Args:
            value: The numeric value
            unit: The original unit string
            category: Optional category hint (emissions, energy, etc.)

        Returns:
            NormalizedValue with full conversion provenance, or None if unknown unit
        """
        unit_lower = unit.lower().strip()

        # Auto-detect category if not provided
        if category is None:
            category = self._detect_category(unit_lower)

        if category is None:
            logger.warning(f"Cannot determine category for unit: {unit}")
            return None

        conversions = UNIT_CONVERSIONS.get(category, {})
        factor = conversions.get(unit_lower)

        if factor is None:
            # Try fuzzy matching
            factor = self._fuzzy_match_unit(unit_lower, conversions)

        if factor is None:
            logger.warning(f"Unknown unit '{unit}' for category '{category}'")
            return None

        normalized_value = value * factor
        base_unit = BASE_UNITS[category]

        return NormalizedValue(
            original_value=value,
            original_unit=unit,
            normalized_value=normalized_value,
            normalized_unit=base_unit,
            conversion_rule=f"{value} {unit} × {factor} = {normalized_value} {base_unit}",
            category=category,
        )

    def compare_values(
        self,
        value1: float, unit1: str,
        value2: float, unit2: str,
        category: Optional[str] = None,
    ) -> Optional[dict]:
        """
        Compare two values after normalizing to the same unit.

        Returns:
            dict with normalized values, difference, and percentage change
        """
        norm1 = self.normalize(value1, unit1, category)
        norm2 = self.normalize(value2, unit2, category)

        if norm1 is None or norm2 is None:
            return None

        if norm1.normalized_unit != norm2.normalized_unit:
            return None

        diff = norm2.normalized_value - norm1.normalized_value
        pct_change = (diff / norm1.normalized_value * 100) if norm1.normalized_value != 0 else None

        return {
            "value1": norm1.normalized_value,
            "value2": norm2.normalized_value,
            "unit": norm1.normalized_unit,
            "absolute_difference": diff,
            "percentage_change": pct_change,
            "conversion1": norm1.conversion_rule,
            "conversion2": norm2.conversion_rule,
        }

    def _detect_category(self, unit_lower: str) -> Optional[str]:
        """Auto-detect the category from the unit string."""
        for category, conversions in UNIT_CONVERSIONS.items():
            if unit_lower in conversions:
                return category

        # Pattern-based detection
        if any(kw in unit_lower for kw in ["co2", "carbon", "ghg", "emission"]):
            return "emissions"
        if any(kw in unit_lower for kw in ["wh", "joule", "btu", "gj", "tj"]):
            return "energy"
        if any(kw in unit_lower for kw in ["liter", "litre", "gallon", "m3", "m³"]):
            return "water"
        if any(kw in unit_lower for kw in ["%", "percent", "pct"]):
            return "percentage"
        if any(kw in unit_lower for kw in ["$", "usd", "eur", "gbp"]):
            return "currency"

        return None

    def _fuzzy_match_unit(self, unit_lower: str, conversions: dict) -> Optional[float]:
        """Try fuzzy matching for common unit variations."""
        # Remove extra spaces and common noise words
        cleaned = re.sub(r'\s+', ' ', unit_lower).strip()
        cleaned = cleaned.replace("metric ", "").replace("short ", "")

        if cleaned in conversions:
            return conversions[cleaned]

        # Try without spaces
        no_space = cleaned.replace(" ", "")
        for key, factor in conversions.items():
            if key.replace(" ", "") == no_space:
                return factor

        return None
