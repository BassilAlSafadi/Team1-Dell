import sys
from pathlib import Path

# ai-service's modules (waste_classifier, vendor_search, ...) are flat top-level
# scripts, not an installed package, so make the service root importable for tests.
sys.path.insert(0, str(Path(__file__).resolve().parent))
