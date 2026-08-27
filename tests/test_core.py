"""
Sustainability MMKG-RAG: Test Suite
"""

import pytest
from mmkg.ontology import EntityType, RelationType
from reasoning.units import UnitNormalizer

def test_ontology_types():
    assert EntityType.REPORT.value == "Report"
    assert EntityType.KPI.value == "KPI"
    assert RelationType.MENTIONED_ON.value == "MENTIONED_ON"

def test_unit_normalization():
    normalizer = UnitNormalizer()
    
    # Emissions
    res = normalizer.normalize(1.5, "Mt CO2e")
    assert res is not None
    assert res.normalized_value == 1500000.0
    assert res.normalized_unit == "t CO2e"
    
    # Energy
    res2 = normalizer.normalize(1000, "kWh")
    assert res2 is not None
    assert res2.normalized_value == 1.0
    assert res2.normalized_unit == "MWh"
    
    # Comparison
    comp = normalizer.compare_values(1.5, "Mt CO2e", 2.0, "Mt CO2e")
    assert comp is not None
    assert comp["absolute_difference"] == 500000.0
