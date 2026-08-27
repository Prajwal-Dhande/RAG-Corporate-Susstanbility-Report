# Knowledge Graph-Powered Multimodal RAG for Corporate Sustainability Report Analysis

An advanced, non-conversational document intelligence and analytics platform for processing corporate sustainability reports. This research prototype uses Multimodal Knowledge Graphs (MMKG) and Retrieval-Augmented Generation (RAG) to extract, structure, and analyze sustainability metrics (KPIs, targets, emissions) with full evidence provenance.

## ⚠️ Core Design Principle
**This is NOT a chatbot.** There is no conversational interface. The system is designed as a structured analytics dashboard that processes reports into a graph database and performs deterministic reasoning (gap analysis, trend detection, cross-modal consistency checking) on top of the extracted facts.

## Features
- **Multimodal Extraction**: Parses text, tables, and images from PDFs.
- **Knowledge Graph Construction**: Builds a typed entity-relation graph of sustainability data.
- **Hybrid Retrieval**: Combines semantic (vector), lexical (keyword), and graph-based retrieval.
- **Deterministic Reasoning**: Computes target progress, YoY changes, and unit normalizations deterministically without LLM hallucination.
- **Evidence Provenance**: Traces every extracted fact back to the exact source page and component.
- **Professional Dashboard**: React/Next.js frontend with analytical visualizations and graph exploration.

## Architecture
- **Backend**: FastAPI (Python), SQLAlchemy (SQLite), NetworkX (Graph), SentenceTransformers (Embeddings).
- **Frontend**: Next.js (React), Recharts (Charts), Vanilla CSS.
- **Models**: OpenAI GPT-4o-mini (Extraction), CLIP/SentenceTransformers (Retrieval).

## Getting Started

### Prerequisites
- Python 3.12+
- Node.js 18+
- OpenAI API Key

### Backend Setup
1. Create and activate a virtual environment.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Set up environment variables:
   Copy `.env.example` to `.env` and add your `OPENAI_API_KEY`.
4. Run the server:
   ```bash
   python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

### Frontend Setup
1. Navigate to the `frontend` directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```

Open `http://localhost:3000` to access the application.

## Testing
Run unit tests with pytest:
```bash
pytest tests/
```
