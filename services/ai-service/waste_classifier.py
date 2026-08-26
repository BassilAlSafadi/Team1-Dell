from __future__ import annotations

import argparse
import base64
import io
import sys

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from PIL import Image, ImageOps

from pydantic import BaseModel, Field

from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_google_genai import ChatGoogleGenerativeAI

# Vendor search
from vendor_search import search_vendors_for_categories

# Persistence
from db.repository import save_classification
from db.schemas import ClassificationRecord
from identity import DEMO_USER_ID

# Gemini API key + model fallback handling, shared with waste_recommendations.py/chatbot.
from gemini_keys import call_with_gemini_fallback

# Agentic RAG: reuse the same Chroma-backed tools (and vector store built by
# `python -m chatbot.ingest`) that the chat assistant uses, so the classifier consults
# the same knowledge base instead of maintaining a second copy of it.
from chatbot.tools import search_egypt_waste_law, search_recycling_guide


# ============================================================
# 1. CONFIGURATION
# ============================================================

load_dotenv()

IMAGE_SUFFIXES = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".bmp",
    ".jfif",
}

MAX_EDGE_PX = 1024

# Agentic RAG: the model decides per image whether either knowledge base is worth
# consulting before it commits to a classification.
RAG_TOOLS = [search_egypt_waste_law, search_recycling_guide]
RAG_TOOLS_BY_NAME = {t.name: t for t in RAG_TOOLS}
MAX_TOOL_ROUNDS = 3


# ============================================================
# 2. WASTE CATEGORIES
# ============================================================

CategoryKey = Literal[
    "paper_cardboard",
    "plastics",
    "glass",
    "metal",
    "organic_food",
    "e_waste",
    "hazardous",
    "general_landfill",
]


CATEGORY_INFO = {

    "paper_cardboard": {
        "label": "Paper & cardboard",
        "vendor_type": "Paper/cardboard recycler",
    },

    "plastics": {
        "label": "Plastics",
        "vendor_type": "Plastic recycler",
    },

    "glass": {
        "label": "Glass",
        "vendor_type": "Glass recycler",
    },

    "metal": {
        "label": "Metal",
        "vendor_type": "Metal recycler / scrap dealer",
    },

    "organic_food": {
        "label": "Organic / food waste",
        "vendor_type": "Composter / biogas / organic waste processor",
    },

    "e_waste": {
        "label": "E-waste",
        "vendor_type": "Certified e-waste recycler",
    },

    "hazardous": {
        "label": "Hazardous",
        "vendor_type": "Licensed hazardous waste handler",
    },

    "general_landfill": {
        "label": "General / landfill",
        "vendor_type": "General waste collector",
    },
}


SAFETY_CRITICAL = {
    "e_waste",
    "hazardous",
}


# ============================================================
# 3. PYDANTIC OUTPUT SCHEMA
# ============================================================

class DetectedItem(BaseModel):

    description: str = Field(
        description="Short description of the object, e.g. plastic bottle"
    )

    category: CategoryKey = Field(
        description="One of the eight allowed waste categories"
    )

    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Confidence between 0 and 1"
    )

    material_evidence: str = Field(
        description="Visual evidence used to identify the material"
    )


class WasteClassification(BaseModel):

    primary_category: CategoryKey = Field(
        description="Main waste category based on the dominant material"
    )

    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Confidence in the primary category"
    )

    items: list[DetectedItem] = Field(
        default_factory=list,
        description="Every distinct waste item visible in the image"
    )

    is_mixed: bool = Field(
        description="True if multiple waste categories are present"
    )

    hazard_flag: bool = Field(
        description=(
            "True if hazardous material is present or suspected, "
            "including batteries, chemicals, paint, solvents, aerosols, "
            "fluorescent bulbs, sharps or medical waste"
        )
    )

    hazard_reason: str = Field(
        default="",
        description="Explanation of the hazard if one exists"
    )

    contamination_notes: str = Field(
        default="",
        description=(
            "Contamination that could make the waste difficult to recycle, "
            "such as food residue, grease, liquid or wet paper"
        )
    )

    reasoning: str = Field(
        description="Short explanation of why the primary category was selected"
    )


# ============================================================
# 4. SYSTEM PROMPT
# ============================================================

SYSTEM_PROMPT = """
You are an AI waste characterisation specialist helping
small businesses sort their commercial waste.

Your job is to analyze a photograph and classify the waste
into the correct collection stream.

The ONLY allowed categories are:

1. Paper & cardboard
2. Plastics
3. Glass
4. Metal
5. Organic / food waste
6. E-waste
7. Hazardous
8. General / landfill
9. Mixed waste (if multiple categories are present)
10. Contaminated (if contamination is present)
11. Reuse 

IMPORTANT RULES:

1. Identify every distinct waste item you can see.

2. Classify based on the MATERIAL, not the object's purpose.

3. Look for visual material clues:
   - Plastic: resin markings, mould seams, plastic texture
   - Metal: metallic sheen, seams, rigid metal structure
   - Glass: transparency, thickness, glass texture
   - Paper: visible paper fibres
   - Cardboard: layered paper structure

4. If multiple categories are present:
   - Set is_mixed = true.
   - List the individual items.

5. If hazardous material is present or suspected:
   - Set hazard_flag = true.
   - Explain the hazard.

6. E-waste should include electronics such as:
   - phones
   - laptops
   - chargers
   - cables
   - electronic devices

7. Hazardous waste can include:
   - batteries
   - chemicals
   - paint
   - solvents
   - aerosols
   - fluorescent bulbs
   - medical/sharp waste

8. Check for contamination:
   - food residue
   - grease
   - liquids
   - wet paper
   - dirty containers

9. Do not invent a new category.

10. If you are uncertain, give a LOW confidence score.
Do not pretend to be certain.

TOOLS:
You have two knowledge-base search tools available. Decide for yourself, per image,
whether either is worth calling — do not call a tool when the material and its correct
handling are already obvious to you.

- search_egypt_waste_law: search Egypt's Waste Management Law No. 202/2020. Use this
  when it's unclear whether an item is legally hazardous or e-waste, or when a legal
  definition would change primary_category or hazard_flag.
- search_recycling_guide: search the recycling how-to guide. Use this when you're
  unsure how a material should be sorted, stored or handled, to ground
  contamination_notes or material_evidence.

You may call a tool more than once, and you may call both, before giving your final
answer. When you do use a tool, ground hazard_reason, contamination_notes and reasoning
in what it returned, and cite the source (e.g. the law article number) where relevant.

Confidence guidelines:
- 0.90+ = very clear material
- 0.70-0.89 = reasonably clear
- 0.40-0.69 = uncertain
- below 0.40 = mostly a guess
"""


USER_PROMPT = """
Analyze this waste image.

Identify every waste item you can see,
classify each item,
identify the primary waste category,
check whether the image contains mixed waste,
flag hazardous or electronic waste,
and mention any contamination.
"""


# ============================================================
# 5. IMAGE PROCESSING
# ============================================================

def _encode_pil_image(
    img: Image.Image,
    max_edge: int = MAX_EDGE_PX
) -> tuple[str, str]:
    """Shared resize/re-encode step behind encode_image() and encode_image_bytes() —
    takes an already-opened PIL image, returns (base64 JPEG, mime type)."""

    # Fix phone-camera rotation
    img = ImageOps.exif_transpose(img)

    # Convert unsupported formats to RGB
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    # Resize large images
    img.thumbnail(
        (max_edge, max_edge),
        Image.Resampling.LANCZOS
    )

    # Convert to JPEG
    buffer = io.BytesIO()

    img.save(
        buffer,
        format="JPEG",
        quality=85,
        optimize=True
    )

    encoded = base64.b64encode(
        buffer.getvalue()
    ).decode("utf-8")

    return encoded, "image/jpeg"


def encode_image(
    path: Path,
    max_edge: int = MAX_EDGE_PX
) -> tuple[str, str]:

    with Image.open(path) as img:
        return _encode_pil_image(img, max_edge=max_edge)


def encode_image_bytes(
    data: bytes,
    max_edge: int = MAX_EDGE_PX
) -> tuple[str, str]:
    """Same as encode_image(), for in-memory image bytes (e.g. from a gRPC request)
    instead of a filesystem path — PIL's Image.open() accepts a file-like object."""

    with Image.open(io.BytesIO(data)) as img:
        return _encode_pil_image(img, max_edge=max_edge)


def _message_from_encoded(data: str, mime: str) -> HumanMessage:

    return HumanMessage(
        content=[
            {
                "type": "text",
                "text": USER_PROMPT
            },
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:{mime};base64,{data}"
                }
            },
        ]
    )


def build_message(path: Path) -> HumanMessage:

    data, mime = encode_image(path)
    return _message_from_encoded(data, mime)


def build_message_bytes(data: bytes, image_name: str) -> HumanMessage:
    """Same as build_message(), for in-memory image bytes. image_name is unused here
    (kept for symmetry/logging at call sites) — the model only sees the image data."""

    encoded, mime = encode_image_bytes(data)
    return _message_from_encoded(encoded, mime)


# ============================================================
# 6. RESULT OBJECT
# ============================================================

@dataclass
class Result:

    path: Path

    classification: WasteClassification | None

    error: str | None = None

    @property
    def needs_review(self) -> bool:

        if self.classification is None:
            return True

        c = self.classification

        if (
            c.primary_category in SAFETY_CRITICAL
            or c.hazard_flag
        ):
            threshold = 0.85
        else:
            threshold = 0.60

        return (
            c.confidence < threshold
            or c.is_mixed
        )


# ============================================================
# 6.5 PERSIST CLASSIFICATION
# ============================================================

def save_classification_result(result: Result, user_id: str) -> str | None:
    """Persists a successful classification to the waste_classifications
    collection, so waste_recommendations.py can build trend data from real
    scan history instead of mock data. No-ops on a failed classification."""

    if result.classification is None:
        return None

    c = result.classification

    return save_classification(
        ClassificationRecord(
            user_id=user_id,
            image_name=result.path.name,
            primary_category=c.primary_category,
            confidence=c.confidence,
            is_mixed=c.is_mixed,
            hazard_flag=c.hazard_flag,
            hazard_reason=c.hazard_reason,
            contamination_notes=c.contamination_notes,
            reasoning=c.reasoning,
            items=[item.model_dump() for item in c.items],
        )
    )


# ============================================================
# 7. VENDOR RECOMMENDATIONS
# ============================================================
#
# A single image can contain several kinds of waste (e.g. plastic bottles
# *and* cardboard boxes), so vendor matching runs per detected category, not
# just against primary_category. Gemini stays responsible for classification;
# vendor_search.py stays responsible for vendor matching — this glue just
# extracts the categories Gemini actually found and hands them off.
# ============================================================

def get_detected_categories(
    classification: WasteClassification
) -> list[CategoryKey]:
    """Unique item categories from the classification, in first-seen order.
    Falls back to primary_category only if the model returned no items."""

    categories = list(
        dict.fromkeys(
            item.category for item in classification.items
        )
    )

    return categories or [classification.primary_category]


def recommend_vendors(
    classification: WasteClassification,
    business_location: str | None = None,
) -> dict[str, list[dict]]:
    """Vendor recommendations grouped by every waste category detected in the
    image."""

    categories = get_detected_categories(classification)

    return search_vendors_for_categories(
        categories,
        business_location=business_location,
    )


# ============================================================
# 8. GEMINI WASTE CLASSIFIER
# ============================================================

class WasteClassifier:

    def __init__(
        self,
        temperature: float = 0.0,
    ):

        self._temperature = temperature

        # tool_llm/structured_llm are (re)built per attempt in _build_llms(), since
        # which model+key to use is decided fresh by call_with_gemini_fallback() every
        # time — there's no single "the" model/key bound at construction time anymore.
        self.tool_llm = None
        self.structured_llm = None

        self.system = SystemMessage(
            content=SYSTEM_PROMPT
        )

    def _build_llms(self, model: str, api_key: str) -> None:
        """(Re)builds tool_llm/structured_llm bound to the given model+key — called once
        per attempt from _attempt_classification()."""

        llm = ChatGoogleGenerativeAI(
            model=model,
            temperature=self._temperature,
            google_api_key=api_key,
            # gemini_keys.call_with_gemini_fallback() already retries across every model/key
            # combination the instant a call fails, so the SDK's own retries just add latency
            # retrying the same already-failing model/key before our fallback gets a turn.
            max_retries=0,
        )

        # Two bindings of the same model: one free to call the RAG tools while it
        # reasons, one locked to the structured schema for the final answer. Gemini
        # doesn't reliably emit both tool calls and a structured JSON payload in the
        # same turn, so retrieval and the final classification are separate calls over
        # the same message history.
        self.tool_llm = llm.bind_tools(RAG_TOOLS)
        self.structured_llm = llm.with_structured_output(
            WasteClassification,
            method="json_schema"
        )

    def _run_agentic_retrieval(self, messages: list) -> None:
        """Lets the model decide whether to consult the Egyptian waste law and/or the
        recycling guide before classifying. Appends any tool-call and tool-result
        messages to `messages` in place; leaves it untouched if no tool is ever
        called."""

        for _ in range(MAX_TOOL_ROUNDS):

            ai_message = self.tool_llm.invoke(messages)
            messages.append(ai_message)

            if not ai_message.tool_calls:
                return

            for tool_call in ai_message.tool_calls:

                print(
                    f"  🔎 Consulting {tool_call['name']}({tool_call['args']})...",
                    file=sys.stderr,
                )

                tool_fn = RAG_TOOLS_BY_NAME[tool_call["name"]]
                result = tool_fn.invoke(tool_call["args"])

                messages.append(
                    ToolMessage(
                        content=str(result),
                        tool_call_id=tool_call["id"],
                    )
                )

    def _attempt_classification(
        self, model: str, api_key: str, image_message: HumanMessage
    ) -> WasteClassification:
        """One (model, api_key) attempt — called by call_with_gemini_fallback(), which
        retries this with the next model/key in the fallback chain on a retryable
        failure. Raises on any error; the caller (_classify_from_message) turns a final,
        unrecoverable failure into Result(error=...)."""

        print(f"  🔮 Classifying with model={model}...", file=sys.stderr)
        self._build_llms(model, api_key)

        messages: list = [
            self.system,
            image_message,
        ]

        self._run_agentic_retrieval(messages)

        # The retrieval loop can end on an assistant turn (the model's own text reply
        # once it stops calling tools), which Gemini won't generate from directly. Add
        # an explicit final turn so the structured-output call always has a
        # user/function message to respond to.
        messages.append(
            HumanMessage(
                content=(
                    "Using the image and anything the tools returned above, give "
                    "your final waste classification now."
                )
            )
        )

        return self.structured_llm.invoke(messages)

    def _classify_from_message(self, path: Path, image_message: HumanMessage) -> Result:
        """Shared classification loop behind classify() and classify_bytes() — both
        just build the initial image message differently. Tries every
        (model, api_key) combination in MODEL_FALLBACK_CHAIN x configured keys via
        call_with_gemini_fallback() before giving up."""

        try:
            classification = call_with_gemini_fallback(
                lambda model, api_key: self._attempt_classification(
                    model, api_key, image_message
                )
            )
            return Result(path=path, classification=classification)

        except Exception as exc:

            return Result(
                path=path,
                classification=None,
                error=f"{type(exc).__name__}: {exc}"
            )

    def classify(
        self,
        path: Path
    ) -> Result:

        return self._classify_from_message(path, build_message(path))

    def classify_bytes(
        self,
        image_bytes: bytes,
        image_name: str
    ) -> Result:
        """Same as classify(), for in-memory image bytes (the gRPC ClassifyWaste path) —
        Result.path holds a synthetic Path(image_name) purely for display/logging
        (print_result, save_classification_result use .name), since there's no real
        file on disk."""

        return self._classify_from_message(
            Path(image_name),
            build_message_bytes(image_bytes, image_name),
        )


# ============================================================
# 9. PRINT RESULT + VENDOR SEARCH
# ============================================================

def print_result(result: Result, business_location: str | None = None):

    print("\n" + "=" * 60)

    print(f"IMAGE: {result.path.name}")

    # --------------------------------------------------------
    # Error
    # --------------------------------------------------------

    if result.classification is None:

        print("ERROR:")
        print(result.error)

        return

    # --------------------------------------------------------
    # Classification
    # --------------------------------------------------------

    c = result.classification

    category = CATEGORY_INFO[
        c.primary_category
    ]

    print(
        f"\nPrimary category : "
        f"{category['label']}"
    )

    print(
        f"Confidence       : "
        f"{c.confidence:.0%}"
    )

    print(
        f"Vendor type      : "
        f"{category['vendor_type']}"
    )

    print(
        f"Mixed waste      : "
        f"{c.is_mixed}"
    )

    print(
        f"Hazard detected  : "
        f"{c.hazard_flag}"
    )

    if c.hazard_flag:

        print(
            f"Hazard reason    : "
            f"{c.hazard_reason}"
        )

    if c.contamination_notes:

        print(
            f"Contamination    : "
            f"{c.contamination_notes}"
        )

    # --------------------------------------------------------
    # Detected items
    # --------------------------------------------------------

    print("\nDetected items:")

    for item in c.items:

        print(
            f"  - {item.description}"
        )

        print(
            f"    Category   : "
            f"{CATEGORY_INFO[item.category]['label']}"
        )

        print(
            f"    Confidence : "
            f"{item.confidence:.0%}"
        )

        print(
            f"    Evidence   : "
            f"{item.material_evidence}"
        )

    print(
        f"\nReasoning: {c.reasoning}"
    )

    # ========================================================
    # VENDOR SEARCH
    # ========================================================

    print("\n🏭 Matching Vendors:")

    try:

        vendors_by_category = recommend_vendors(
            c,
            business_location=business_location,
        )

        for category, vendors in vendors_by_category.items():

            print(
                f"\n{CATEGORY_INFO[category]['label'].upper()}"
            )

            if not vendors:

                print(
                    "  No matching vendors found."
                )

                continue

            for i, vendor in enumerate(vendors, start=1):

                print(
                    f"{i}. {vendor['name']}"
                )

                # Print extra information if it exists
                if "offer_price" in vendor:
                    print(
                        f"   {vendor['offer_price']} EGP/kg"
                    )

                if "location" in vendor:
                    print(
                        f"   {vendor['location']}"
                    )

                if "pickup_available" in vendor:
                    pickup = (
                        "Available"
                        if vendor["pickup_available"]
                        else "Not available"
                    )
                    print(
                        f"   Pickup: {pickup}"
                    )

    except Exception as exc:

        print(
            f"  ❌ Vendor search error: {exc}"
        )

    # --------------------------------------------------------
    # Human review
    # --------------------------------------------------------

    if result.needs_review:

        print(
            "\n⚠️ FLAGGED FOR HUMAN REVIEW"
        )


# ============================================================
# 10. FIND IMAGES
# ============================================================

def collect_images(
    target: Path
) -> list[Path]:

    if target.is_file():

        return [target]

    return sorted(
        p
        for p in target.rglob("*")
        if p.suffix.lower()
        in IMAGE_SUFFIXES
    )


# ============================================================
# 11. MAIN
# ============================================================
if __name__ == "__main__":

    # Folder containing this Python file
    BASE_DIR = Path(__file__).resolve().parent

    # images/test1.jfif
    image_path = BASE_DIR / "images" / "test1.jfif"

    # Demo business location, used to prioritize same-location vendors.
    BUSINESS_LOCATION = "Nasr City"

    print(f"Python file: {__file__}")
    print(f"Base directory: {BASE_DIR}")
    print(f"Image path: {image_path}")

    if not image_path.exists():
        print("❌ Image does not exist!")
        sys.exit(1)

    print("✅ Image found")
    print("🚀 Sending image to Gemini...")

    classifier = WasteClassifier()

    print("⏳ Waiting for Gemini response...")

    result = classifier.classify(image_path)

    print("✅ Gemini response received")

    save_classification_result(result, user_id=DEMO_USER_ID)

    print_result(result, business_location=BUSINESS_LOCATION)