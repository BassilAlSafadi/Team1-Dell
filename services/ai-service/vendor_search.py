import json
from pathlib import Path


# Path to vendors.json
VENDORS_FILE = Path(__file__).parent / "vendors.json"


def load_vendors():
    with open(VENDORS_FILE, "r", encoding="utf-8") as file:
        return json.load(file)


def search_vendors(category):
    vendors = load_vendors()

    matching_vendors = []

    for vendor in vendors:
        if category in vendor["categories"]:
            matching_vendors.append(vendor)

    return matching_vendors


if __name__ == "__main__":

    results = search_vendors("plastics")

    print(f"Found {len(results)} vendor(s):")

    for vendor in results:
        print(
            f"- {vendor['name']} "
            f"({vendor['vendor_type']})"
        )