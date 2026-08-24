Source PDFs for the RAG knowledge bases (gitignored, not committed):

- `recycling_howto_msw.pdf` — UNIDO "Fundamentals of Municipal Solid Waste Management", the how-to-recycle knowledge base.
- `egypt_waste_law_202_2020.pdf` — Egypt's Waste Management Law No. 202/2020, the legal-compliance knowledge base.

After placing both files here, build the vector store with:

```
python -m chatbot.ingest
```
