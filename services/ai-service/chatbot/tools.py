import sys

from langchain_chroma import Chroma
from langchain_core.tools import tool
from langchain_huggingface import HuggingFaceEmbeddings

from chatbot import config

if str(config.SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(config.SERVICE_ROOT))

from vendor_search import search_vendors  # noqa: E402  (ai-service root module)

_embeddings = HuggingFaceEmbeddings(model_name=config.EMBEDDING_MODEL_NAME)

_recycling_guide_store = Chroma(
    collection_name=config.RECYCLING_GUIDE_COLLECTION,
    embedding_function=_embeddings,
    persist_directory=str(config.VECTOR_STORE_DIR),
)
_egypt_law_store = Chroma(
    collection_name=config.EGYPT_LAW_COLLECTION,
    embedding_function=_embeddings,
    persist_directory=str(config.VECTOR_STORE_DIR),
)


def _format_results(results, empty_message: str) -> str:
    if not results:
        return empty_message

    parts = []
    for doc in results:
        source = doc.metadata.get("source", "unknown source")
        page = doc.metadata.get("page", "?")
        parts.append(f"[{source}, p.{page}]\n{doc.page_content}")

    return "\n\n---\n\n".join(parts)


@tool
def search_recycling_guide(query: str) -> str:
    """Search the recycling how-to knowledge base (UNIDO Fundamentals of Municipal Solid
    Waste Management) for practical guidance on how to sort, prepare, store or process
    recyclable/waste materials. Use this whenever the user asks HOW to recycle or handle
    a material, not for legal questions and not for "where do I take this" questions."""
    results = _recycling_guide_store.similarity_search(query, k=4)
    return _format_results(results, "No relevant guidance found in the recycling knowledge base.")


@tool
def search_egypt_waste_law(query: str) -> str:
    """Search Egypt's Waste Management Law No. 202/2020 for legal rules, obligations,
    definitions or penalties related to waste management and recycling in Egypt. Use this
    to check whether advice complies with Egyptian law, or when the user asks a legal
    question about waste/recycling regulation in Egypt."""
    results = _egypt_law_store.similarity_search(query, k=4)
    return _format_results(results, "No relevant provision found in Law 202/2020.")


@tool
def find_recycling_vendor(category: str) -> str:
    """Look up local vendors/facilities that accept a given waste category (e.g. plastics,
    paper_cardboard, glass, metal, organic_food, e_waste, hazardous, general_landfill).
    Use this for "where do I take this" / "who recycles this near me" questions. This is a
    plain lookup against a local vendor directory, not a knowledge-base search."""
    vendors = search_vendors(category)
    if not vendors:
        return f"No listed vendors found for category '{category}'."

    lines = [f"- {v['name']} ({v['vendor_type']})" for v in vendors]
    return "\n".join(lines)


ALL_TOOLS = [search_recycling_guide, search_egypt_waste_law, find_recycling_vendor]
