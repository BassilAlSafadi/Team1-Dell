from typing import Callable, Optional

from langchain_core.messages import BaseMessage, SystemMessage, ToolMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from chatbot import config
from chatbot.tools import ALL_TOOLS

SYSTEM_PROMPT = """You are a recycling assistant for users in Egypt.

You have three tools available. Decide for yourself, per message, whether any tool is
needed — do not call a tool for greetings or small talk, and do not call every tool on
every message.

- search_recycling_guide: use when the user asks HOW to recycle, sort, store or process
  a material.
- search_egypt_waste_law: use when the user asks a legal question, or whenever your
  recycling advice involves an obligation, restriction or penalty that should comply
  with Egyptian law — cross-check it against this tool before stating it as compliant.
- find_recycling_vendor: use when the user asks WHERE to take a material or who accepts
  it locally. This is a plain lookup, not a knowledge-base search. If the vendor
  directory has nothing for that category, answer from your own general knowledge
  instead of leaving the question unanswered — do not call search_recycling_guide or
  search_egypt_waste_law for this kind of question.

When you use a tool's results, ground your answer in them and keep any Egyptian law
citation specific (mention the article if the tool result includes one). Reply in the
same language the user wrote in (Arabic or English).
If the user asks for anything about how to break a law or avoid a legal obligation, refuse to answer and explain that you cannot provide and answer what can be answered like normal info for example while still avoiding to answer illegal or unsafe requests. If the user asks for anything illegal or unsafe, refuse to answer and explain that you cannot provide that information.
"""

_TOOLS_BY_NAME = {t.name: t for t in ALL_TOOLS}


def build_llm() -> ChatGoogleGenerativeAI:
    llm = ChatGoogleGenerativeAI(
        model=config.GEMINI_CHAT_MODEL,
        api_key=config.GEMINI_API_KEY,
        temperature=0.3,
    )
    return llm.bind_tools(ALL_TOOLS)


def _chunk_text(content) -> str:
    """Extracts plain text from a chunk's content, which for extended-thinking
    Gemini models is a list of content blocks (text blocks interleaved with
    signature-only blocks) rather than a plain string."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            block.get("text", "")
            for block in content
            if isinstance(block, dict) and block.get("type") == "text"
        )
    return ""


def _stream_message(
    llm,
    messages: list[BaseMessage],
    on_chunk: Optional[Callable[[str], None]] = None,
) -> BaseMessage:
    """Streams one LLM turn via model.stream(), accumulating the chunks into a
    single message (chunk addition merges content and tool_calls). Calls
    `on_chunk` with each piece of text content as it arrives, if given."""
    full = None
    for chunk in llm.stream(messages):
        full = chunk if full is None else full + chunk
        if on_chunk is not None:
            text = _chunk_text(chunk.content)
            if text:
                on_chunk(text)
    return full


def run_turn(
    messages: list[BaseMessage],
    llm,
    max_tool_rounds: int = 4,
    on_chunk: Optional[Callable[[str], None]] = None,
) -> BaseMessage:
    """Runs the agentic tool-calling loop for one user turn and appends every
    intermediate message (AI tool-call messages, tool results) to `messages` in place.
    Returns the final assistant message."""
    for _ in range(max_tool_rounds):
        ai_message = _stream_message(llm, messages, on_chunk)
        messages.append(ai_message)

        if not ai_message.tool_calls:
            return ai_message

        for tool_call in ai_message.tool_calls:
            tool_fn = _TOOLS_BY_NAME[tool_call["name"]]
            result = tool_fn.invoke(tool_call["args"])
            messages.append(ToolMessage(content=str(result), tool_call_id=tool_call["id"]))

    # Ran out of tool-call rounds: force a text-only final answer by calling the raw,
    # tools-unbound model. tool_choice="none" is not reliable here — with a long tool
    # round message history the model still returned empty-content tool-call messages
    # despite it. Dropping the tools binding entirely makes that structurally impossible.
    no_tools_llm = getattr(llm, "bound", llm)
    final_message = _stream_message(no_tools_llm, messages, on_chunk)
    messages.append(final_message)
    return final_message


def new_conversation() -> list[BaseMessage]:
    return [SystemMessage(content=SYSTEM_PROMPT)]
