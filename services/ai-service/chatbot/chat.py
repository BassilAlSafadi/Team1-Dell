"""Persistent CLI chat loop. Run with: python -m chatbot.chat
Type END to quit."""

import logging
import sys

from langchain_core.messages import HumanMessage

# The google-genai SDK logs an "AFC is not recommended" warning per call with no
# handler configured, so Python's logging fallback prints it straight to stderr and
# it lands interleaved mid-line with the streamed "Assistant: " output.
logging.getLogger("google_genai.models").setLevel(logging.ERROR)

from chatbot import config
from chatbot.agent import build_llm, new_conversation, run_turn


def main() -> None:
    if not config.VECTOR_STORE_DIR.exists() or not any(config.VECTOR_STORE_DIR.iterdir()):
        print(
            "No vector store found. Run 'python -m chatbot.ingest' first to build it "
            "from the PDFs in data/source_pdfs/.",
            file=sys.stderr,
        )
        sys.exit(1)

    llm = build_llm()
    messages = new_conversation()

    print("Recycling assistant ready. Type END to quit.\n")

    while True:
        try:
            user_input = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nGoodbye.")
            break

        if user_input.upper() == "END":
            print("Goodbye.")
            break

        if not user_input:
            continue

        messages.append(HumanMessage(content=user_input))
        print("\nAssistant: ", end="", flush=True)
        run_turn(messages, llm, on_chunk=lambda text: print(text, end="", flush=True))
        print("\n")


if __name__ == "__main__":
    main()
