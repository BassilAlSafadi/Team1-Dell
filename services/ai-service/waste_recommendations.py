from collections import Counter, defaultdict
from datetime import datetime
import os

from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI


# ============================================================
# 1. CONFIGURATION
# ============================================================

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")

if not API_KEY:
    raise ValueError("GEMINI_API_KEY not found in .env")

MODEL_NAME = "gemini-3.6-flash"


# ============================================================
# 2. MOCK WASTE SCANS
# ============================================================
#
# These simulate the scans that will eventually come
# from the database.
#
# Each scan contains:
# - category
# - item
# - date
#
# The dates allow us to test weekly trends.
# ============================================================

mock_scans = [

    # --------------------------------------------------------
    # Week 31
    # --------------------------------------------------------

    {
        "category": "plastics",
        "item": "plastic bottle",
        "date": "2026-07-27",
    },

    {
        "category": "plastics",
        "item": "plastic bottle",
        "date": "2026-07-29",
    },


    # --------------------------------------------------------
    # Week 32
    # --------------------------------------------------------

    {
        "category": "plastics",
        "item": "plastic bottle",
        "date": "2026-08-03",
    },

    {
        "category": "plastics",
        "item": "plastic container",
        "date": "2026-08-04",
    },

    {
        "category": "paper_cardboard",
        "item": "cardboard box",
        "date": "2026-08-05",
    },

    {
        "category": "organic_food",
        "item": "food waste",
        "date": "2026-08-06",
    },


    # --------------------------------------------------------
    # Week 33
    # --------------------------------------------------------

    {
        "category": "plastics",
        "item": "plastic bottle",
        "date": "2026-08-10",
    },

    {
        "category": "plastics",
        "item": "plastic bottle",
        "date": "2026-08-11",
    },

    {
        "category": "plastics",
        "item": "plastic container",
        "date": "2026-08-12",
    },

    {
        "category": "paper_cardboard",
        "item": "cardboard box",
        "date": "2026-08-13",
    },


    # --------------------------------------------------------
    # Week 34
    # --------------------------------------------------------

    {
        "category": "plastics",
        "item": "plastic cup",
        "date": "2026-08-17",
    },

    {
        "category": "plastics",
        "item": "plastic packaging",
        "date": "2026-08-18",
    },

    {
        "category": "glass",
        "item": "glass bottle",
        "date": "2026-08-19",
    },
]


# ============================================================
# 3. OVERALL WASTE ANALYSIS
# ============================================================

def analyze_waste(scans):

    total_scans = len(scans)

    if total_scans == 0:
        print("No waste scans available.")
        return None


    # ========================================================
    # COUNT CATEGORIES
    # ========================================================

    category_counts = Counter(
        scan["category"]
        for scan in scans
    )


    # ========================================================
    # CATEGORY STATISTICS
    # ========================================================

    statistics = {}

    for category, count in category_counts.items():

        percentage = (
            count / total_scans
        ) * 100

        statistics[category] = {
            "count": count,
            "percentage": percentage,
        }


    # ========================================================
    # DOMINANT CATEGORY
    # ========================================================

    dominant_category = max(
        statistics,
        key=lambda category:
        statistics[category]["count"]
    )

    dominant_percentage = statistics[
        dominant_category
    ]["percentage"]


    # ========================================================
    # COUNT INDIVIDUAL ITEMS
    # ========================================================

    item_counts = Counter(
        scan["item"]
        for scan in scans
    )

    most_common_item, most_common_item_count = (
        item_counts.most_common(1)[0]
    )

    most_common_item_percentage = (
        most_common_item_count
        / total_scans
    ) * 100


    # ========================================================
    # PRINT OVERALL ANALYSIS
    # ========================================================

    print("\n" + "=" * 60)
    print("OVERALL WASTE ANALYSIS")
    print("=" * 60)

    print(
        f"\nTotal scans: {total_scans}"
    )


    print("\nWaste Statistics:")

    for category, data in statistics.items():

        print(
            f"- {category}: "
            f"{data['count']} scans "
            f"({data['percentage']:.0f}%)"
        )


    print("\nMost Common Waste Items:")

    for item, count in item_counts.most_common():

        percentage = (
            count / total_scans
        ) * 100

        print(
            f"- {item}: "
            f"{count} scans "
            f"({percentage:.0f}%)"
        )


    # ========================================================
    # PATTERN DETECTION
    # ========================================================

    if dominant_percentage >= 50:

        print("\n" + "=" * 60)
        print("WASTE PATTERN DETECTED")
        print("=" * 60)

        print(
            f"\nDominant waste: "
            f"{dominant_category}"
        )

        print(
            f"Percentage: "
            f"{dominant_percentage:.0f}%"
        )

        print(
            f"\nMost common item: "
            f"{most_common_item}"
        )

        print(
            f"Item percentage: "
            f"{most_common_item_percentage:.0f}%"
        )

    else:

        print(
            "\nNo dominant waste category detected."
        )


    # ========================================================
    # RETURN DATA
    # ========================================================

    return {
        "total_scans": total_scans,

        "statistics": statistics,

        "dominant_category":
            dominant_category,

        "dominant_percentage":
            dominant_percentage,

        "most_common_item":
            most_common_item,

        "most_common_item_percentage":
            most_common_item_percentage,
    }


# ============================================================
# 4. WEEKLY WASTE TREND ANALYSIS
# ============================================================

def analyze_weekly_trends(scans):

    print("\n" + "=" * 60)
    print("WASTE TREND ANALYSIS")
    print("=" * 60)


    # ========================================================
    # GROUP SCANS BY WEEK
    # ========================================================

    weekly_data = defaultdict(list)

    for scan in scans:

        date = datetime.strptime(
            scan["date"],
            "%Y-%m-%d"
        )

        year, week, _ = date.isocalendar()

        week_key = (
            f"{year}-W{week:02d}"
        )

        weekly_data[week_key].append(
            scan
        )


    # ========================================================
    # CALCULATE WEEKLY STATISTICS
    # ========================================================

    weekly_statistics = {}

    for week, week_scans in sorted(
        weekly_data.items()
    ):

        total = len(week_scans)

        category_counts = Counter(
            scan["category"]
            for scan in week_scans
        )

        weekly_statistics[week] = {}

        for category, count in (
            category_counts.items()
        ):

            percentage = (
                count / total
            ) * 100

            weekly_statistics[week][category] = {
                "count": count,
                "percentage": percentage,
            }


    # ========================================================
    # PRINT WEEKLY DATA
    # ========================================================

    for week, categories in (
        weekly_statistics.items()
    ):

        print(f"\n{week}")
        print("-" * 30)

        for category, data in (
            categories.items()
        ):

            print(
                f"- {category}: "
                f"{data['percentage']:.0f}% "
                f"({data['count']} scans)"
            )


    # ========================================================
    # COMPARE FIRST AND LAST WEEK
    # ========================================================

    weeks = sorted(
        weekly_statistics.keys()
    )

    if len(weeks) < 2:

        print(
            "\nNot enough weekly data "
            "to detect a trend."
        )

        return {
            "weekly_statistics":
                weekly_statistics,

            "first_week":
                None,

            "last_week":
                None,

            "trend_changes":
                [],
        }


    first_week = weeks[0]
    last_week = weeks[-1]


    print("\n" + "=" * 60)
    print("WASTE TREND DETECTED")
    print("=" * 60)

    print(
        f"\nComparing "
        f"{first_week} → {last_week}"
    )


    # ========================================================
    # GET ALL CATEGORIES
    # ========================================================

    all_categories = set()

    for week_data in (
        weekly_statistics.values()
    ):

        all_categories.update(
            week_data.keys()
        )


    trend_changes = []


    # ========================================================
    # COMPARE CATEGORIES
    # ========================================================

    for category in sorted(all_categories):

        first_percentage = (
            weekly_statistics[
                first_week
            ]
            .get(category, {})
            .get("percentage", 0)
        )

        last_percentage = (
            weekly_statistics[
                last_week
            ]
            .get(category, {})
            .get("percentage", 0)
        )

        difference = (
            last_percentage
            - first_percentage
        )


        if difference > 5:

            print(
                f"\n⚠️ {category} waste increased."
            )

            print(
                f"{first_percentage:.0f}% "
                f"→ "
                f"{last_percentage:.0f}%"
            )

            print(
                f"Increase: "
                f"+{difference:.0f} "
                f"percentage points"
            )

            trend_changes.append({
                "category":
                    category,

                "direction":
                    "increased",

                "change":
                    difference,

                "first_percentage":
                    first_percentage,

                "last_percentage":
                    last_percentage,
            })


        elif difference < -5:

            print(
                f"\n✅ {category} waste decreased."
            )

            print(
                f"{first_percentage:.0f}% "
                f"→ "
                f"{last_percentage:.0f}%"
            )

            print(
                f"Decrease: "
                f"{abs(difference):.0f} "
                f"percentage points"
            )

            trend_changes.append({
                "category":
                    category,

                "direction":
                    "decreased",

                "change":
                    difference,

                "first_percentage":
                    first_percentage,

                "last_percentage":
                    last_percentage,
            })


        else:

            print(
                f"\n• {category}: "
                f"{first_percentage:.0f}% "
                f"→ "
                f"{last_percentage:.0f}% "
                f"(no major change)"
            )


    return {
        "weekly_statistics":
            weekly_statistics,

        "first_week":
            first_week,

        "last_week":
            last_week,

        "trend_changes":
            trend_changes,
    }


# ============================================================
# 5. CONVERT GEMINI RESPONSE TO TEXT
# ============================================================

def response_to_text(response):

    content = response.content


    # --------------------------------------------------------
    # Normal string response
    # --------------------------------------------------------

    if isinstance(content, str):

        return content


    # --------------------------------------------------------
    # List response
    # --------------------------------------------------------

    if isinstance(content, list):

        parts = []

        for part in content:

            if isinstance(part, str):

                parts.append(part)

            elif isinstance(part, dict):

                text = part.get("text")

                if text:
                    parts.append(text)


        return "\n".join(parts)


    # --------------------------------------------------------
    # Fallback
    # --------------------------------------------------------

    return str(content)


# ============================================================
# 6. GENERATE AI WASTE REDUCTION RECOMMENDATION
# ============================================================

def generate_ai_recommendation(
    analysis,
    trend_analysis=None
):

    print("\n" + "=" * 60)
    print("AI WASTE REDUCTION RECOMMENDATION")
    print("=" * 60)


    # ========================================================
    # CREATE DATA SUMMARY
    # ========================================================

    summary = f"""
A small business has recorded waste scans.

TOTAL SCANS:
{analysis["total_scans"]}

OVERALL WASTE CATEGORIES:
"""


    for category, data in (
        analysis["statistics"].items()
    ):

        summary += (
            f"- {category}: "
            f"{data['count']} scans "
            f"({data['percentage']:.1f}%)\n"
        )


    summary += f"""

MOST COMMON WASTE ITEM:
{analysis["most_common_item"]}

MOST COMMON ITEM PERCENTAGE:
{analysis["most_common_item_percentage"]:.1f}%

DOMINANT WASTE CATEGORY:
{analysis["dominant_category"]}

DOMINANT CATEGORY PERCENTAGE:
{analysis["dominant_percentage"]:.1f}%
"""


    # ========================================================
    # ADD TREND DATA
    # ========================================================

    if trend_analysis:

        summary += "\nWASTE TRENDS:\n"

        for change in trend_analysis[
            "trend_changes"
        ]:

            summary += (
                f"- {change['category']}: "
                f"{change['direction']} "
                f"from "
                f"{change['first_percentage']:.1f}% "
                f"to "
                f"{change['last_percentage']:.1f}%\n"
            )


    # ========================================================
    # GEMINI PROMPT
    # ========================================================

    prompt = f"""
You are a waste reduction advisor for small businesses.

Your goal is to help the business REDUCE the amount
of waste it produces.

Do NOT focus mainly on recycling.

Analyze ONLY the following recorded data:

{summary}

Based ONLY on the provided data:

1. Identify the main waste pattern.
2. Explain what the data suggests.
3. Suggest 2-3 practical upstream actions.
4. Focus on reducing waste at the source.
5. Consider suppliers, packaging, reusable alternatives,
   bulk purchasing, purchasing quantities, or operational
   changes when relevant.
6. If a waste category increased, mention it.
7. Do not invent facts that are not supported by the data.
8. Keep the recommendation concise and practical.

Use exactly this format:

PATTERN:
...

WHAT THE DATA SUGGESTS:
...

RECOMMENDED ACTIONS:
1. ...
2. ...
3. ...
"""


    # ========================================================
    # CALL GEMINI
    # ========================================================

    try:

        llm = ChatGoogleGenerativeAI(
            model=MODEL_NAME,
            temperature=0.2,
            google_api_key=API_KEY,
            max_retries=3,
        )

        response = llm.invoke(prompt)


        # ====================================================
        # FIX response.content LIST ERROR
        # ====================================================

        recommendation = response_to_text(
            response
        )


        if not recommendation.strip():

            print(
                "\n❌ Gemini returned an empty response."
            )

            return None


        print("\n")
        print(recommendation)

        return recommendation


    except Exception as exc:

        print(
            "\n❌ Failed to generate "
            "AI recommendation."
        )

        print(
            f"Error: "
            f"{type(exc).__name__}: {exc}"
        )

        return None


# ============================================================
# 7. MAIN
# ============================================================

if __name__ == "__main__":


    # --------------------------------------------------------
    # STEP 1
    # Analyze overall waste
    # --------------------------------------------------------

    analysis = analyze_waste(
        mock_scans
    )


    if analysis:

        # ----------------------------------------------------
        # STEP 2
        # Analyze weekly trends
        # ----------------------------------------------------

        trend_analysis = (
            analyze_weekly_trends(
                mock_scans
            )
        )


        # ----------------------------------------------------
        # STEP 3
        # Ask Gemini for recommendations
        # ----------------------------------------------------

        generate_ai_recommendation(
            analysis,
            trend_analysis
        )
