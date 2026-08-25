"""Feature 1: image -> Gemini classification -> per-category vendor recommendations.

Gemini itself is never called here. Instead each test builds the
`WasteClassification` object exactly as Gemini's structured output would look,
then drives the real (non-mocked) vendor_search.py against the real
vendors.json mock data.
"""

from vendor_search import search_vendors, search_vendors_for_categories
from waste_classifier import (
    DetectedItem,
    WasteClassification,
    get_detected_categories,
    recommend_vendors,
)

BUSINESS_LOCATION = "Nasr City"


def make_classification(item_categories):
    items = [
        DetectedItem(
            description=f"mock {category} item",
            category=category,
            confidence=0.9,
            material_evidence="mock evidence",
        )
        for category in item_categories
    ]

    return WasteClassification(
        primary_category=item_categories[0],
        confidence=0.9,
        items=items,
        is_mixed=len(set(item_categories)) > 1,
        hazard_flag=False,
        reasoning="mock classification for tests",
    )


# ============================================================
# Test 1 — single waste category
# ============================================================

def test_single_category_image_detects_only_plastics():
    classification = make_classification(["plastics"])

    assert get_detected_categories(classification) == ["plastics"]


def test_single_category_returns_both_plastic_vendors_no_others():
    classification = make_classification(["plastics"])

    recommendations = recommend_vendors(classification, business_location=BUSINESS_LOCATION)

    assert list(recommendations.keys()) == ["plastics"]

    names = [vendor["name"] for vendor in recommendations["plastics"]]
    assert names == ["Premium Plastic Buyers", "Green Plastic Recycling"]
    assert "Cairo Paper Recycling" not in names
    assert "Glass Recycling Center" not in names


def test_single_category_sorts_same_location_then_higher_offer_first():
    vendors = search_vendors("plastics", business_location=BUSINESS_LOCATION)

    assert [v["name"] for v in vendors] == ["Premium Plastic Buyers", "Green Plastic Recycling"]
    assert [v["offer_price"] for v in vendors] == [15, 12]


def test_lower_paying_vendor_is_not_dropped():
    vendors = search_vendors("plastics", business_location=BUSINESS_LOCATION)

    names = {v["name"] for v in vendors}
    assert names == {"Premium Plastic Buyers", "Green Plastic Recycling"}


# ============================================================
# Test 2 — multiple waste categories in one image
# ============================================================

def test_multi_category_image_extracts_unique_categories_from_gemini_items():
    classification = make_classification(
        ["plastics", "plastics", "paper_cardboard", "glass"]
    )

    # Deduplicated, in first-seen order, and NOT hardcoded.
    assert get_detected_categories(classification) == [
        "plastics",
        "paper_cardboard",
        "glass",
    ]


def test_multi_category_image_groups_vendors_by_category_without_mixing():
    classification = make_classification(
        ["plastics", "plastics", "paper_cardboard", "glass"]
    )

    recommendations = recommend_vendors(classification, business_location=BUSINESS_LOCATION)

    assert list(recommendations.keys()) == ["plastics", "paper_cardboard", "glass"]

    assert [v["name"] for v in recommendations["plastics"]] == [
        "Premium Plastic Buyers",
        "Green Plastic Recycling",
    ]
    assert [v["name"] for v in recommendations["paper_cardboard"]] == [
        "Cairo Paper Recycling",
    ]
    assert [v["name"] for v in recommendations["glass"]] == [
        "Glass Recycling Center",
    ]


def test_search_vendors_for_categories_delegates_to_search_vendors():
    direct = search_vendors_for_categories(
        ["plastics", "glass"], business_location=BUSINESS_LOCATION
    )

    assert direct["plastics"] == search_vendors("plastics", business_location=BUSINESS_LOCATION)
    assert direct["glass"] == search_vendors("glass", business_location=BUSINESS_LOCATION)


# ============================================================
# Regression: previously-observed bug
# ============================================================

def test_plastic_only_image_never_pulls_in_unrelated_categories():
    """Guards against the earlier bug where a test manually passed
    ["plastics", "paper_cardboard", "glass"] instead of letting the categories
    come from Gemini's actual per-item classification."""

    classification = make_classification(["plastics"])

    categories = get_detected_categories(classification)

    assert categories == ["plastics"]
    assert "paper_cardboard" not in categories
    assert "glass" not in categories
