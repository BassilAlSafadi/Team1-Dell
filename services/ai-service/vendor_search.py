import json
from pathlib import Path


# Path to vendors.json
VENDORS_FILE = Path(__file__).parent / "vendors.json"


def load_vendors():
    with open(VENDORS_FILE, "r", encoding="utf-8") as file:
        return json.load(file)


def search_vendors(category, business_location=None):
    """All vendors accepting `category`, same-location vendors first and higher
    offer price first within that. Never drops a matching vendor for being
    lower-paying — that's a display-order concern, not a filter."""

    vendors = load_vendors()

    matching_vendors = [
        vendor for vendor in vendors
        if category in vendor["categories"]
    ]

    def sort_key(vendor):
        same_location = (
            business_location is not None
            and vendor.get("location") == business_location
        )
        return (not same_location, -vendor.get("offer_price", 0))

    matching_vendors.sort(key=sort_key)

    return matching_vendors


def search_vendors_for_categories(categories, business_location=None):
    """Vendor recommendations grouped by category, e.g. for a single image that
    contains multiple kinds of waste. Delegates to `search_vendors` per category
    rather than re-implementing the matching/sorting logic."""

    unique_categories = list(dict.fromkeys(categories))

    return {
        category: search_vendors(category, business_location=business_location)
        for category in unique_categories
    }


if __name__ == "__main__":

    results = search_vendors("plastics", business_location="Nasr City")

    print(f"Found {len(results)} vendor(s):")

    for vendor in results:
        print(
            f"- {vendor['name']} "
            f"({vendor['vendor_type']})"
        )
