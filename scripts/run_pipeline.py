"""
Sustainability MMKG-RAG: Standalone Pipeline Runner

Script to run the extraction and graph building pipeline from the CLI
without needing the FastAPI backend running.
"""

import asyncio
import sys
import logging
from pathlib import Path
import uuid

from backend.app.services.pipeline import ProcessingPipeline
from backend.app.database import init_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("run_pipeline")

async def main(pdf_path: str, company_name: str):
    path = Path(pdf_path)
    if not path.exists():
        logger.error(f"File not found: {pdf_path}")
        sys.exit(1)

    with open(path, "rb") as f:
        pdf_data = f.read()

    await init_db()
    
    pipeline = ProcessingPipeline()
    report_id = str(uuid.uuid4())
    
    async def on_progress(stage, progress, message):
        logger.info(f"[{stage}] {progress*100:.0f}%: {message}")

    logger.info(f"Starting pipeline for {company_name} ({path.name})")
    
    result = await pipeline.process_report(
        report_id=report_id,
        pdf_data=pdf_data,
        file_name=path.name,
        progress_callback=on_progress
    )
    
    logger.info("Pipeline finished!")
    logger.info(f"Results: {result}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python run_pipeline.py <path_to_pdf> <company_name>")
        sys.exit(1)
    
    asyncio.run(main(sys.argv[1], sys.argv[2]))
