"""
Sustainability MMKG-RAG: Processing Pipeline Orchestrator

End-to-end pipeline that coordinates all stages:
PDF → Parse → Extract → Graph → Embed → Index → Analyze

Runs as a background task with progress reporting.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from typing import Optional

from backend.app.config import get_settings
from document_pipeline.ingestion import ingest_pdf, extract_metadata
from document_pipeline.parser import PDFParser
from document_pipeline.renderer import render_all_pages
from document_pipeline.storage import get_storage
from mmkg.extractor import EntityExtractor
from mmkg.graph_builder import get_graph_backend
from mmkg.ontology import EntityType, GraphEntity, RelationType, GraphRelation
from models.provider import get_model_provider
from retrieval.embeddings import EmbeddingIndex, get_embedding_provider
from retrieval.hybrid import LexicalRetriever

logger = logging.getLogger(__name__)


class ProcessingPipeline:
    """
    Orchestrates the full document processing pipeline.
    Each stage logs progress and can be monitored.
    """

    def __init__(self):
        self.settings = get_settings()
        self.storage = get_storage()
        self.graph = get_graph_backend()
        self.parser = PDFParser()

        # These are lazy-initialized when needed
        self._model_provider = None
        self._extractor = None
        self._embedding_provider = None

    @property
    def model_provider(self):
        if self._model_provider is None:
            self._model_provider = get_model_provider()
        return self._model_provider

    @property
    def extractor(self):
        if self._extractor is None:
            self._extractor = EntityExtractor(self.model_provider)
        return self._extractor

    @property
    def embedding_provider(self):
        if self._embedding_provider is None:
            self._embedding_provider = get_embedding_provider()
        return self._embedding_provider

    async def process_report(
        self,
        report_id: str,
        pdf_data: bytes,
        file_name: str,
        progress_callback=None,
    ) -> dict:
        """
        Run the full processing pipeline for a report.

        Args:
            report_id: Unique report identifier
            pdf_data: Raw PDF file bytes
            file_name: Original file name
            progress_callback: Optional async(stage, progress, message)

        Returns:
            Processing result summary
        """
        result = {
            "report_id": report_id,
            "stages": {},
            "entity_count": 0,
            "relation_count": 0,
            "kpi_count": 0,
            "target_count": 0,
            "page_count": 0,
            "errors": [],
        }

        async def _progress(stage: str, progress: float, message: str):
            result["stages"][stage] = {"progress": progress, "message": message}
            if progress_callback:
                await progress_callback(stage, progress, message)
            logger.info(f"[{report_id}] {stage}: {message} ({progress:.0%})")

        try:
            # ── Stage 1: PDF Validation & Storage ──
            await _progress("ingestion", 0.0, "Validating PDF...")
            start = time.time()
            storage_key, metadata = await ingest_pdf(
                pdf_data, file_name, report_id, self.storage, self.settings.pdf_max_size_mb
            )
            result["page_count"] = metadata.page_count
            result["stages"]["ingestion"] = {
                "duration": time.time() - start,
                "status": "completed",
            }
            await _progress("ingestion", 1.0, f"PDF validated: {metadata.page_count} pages")

            # ── Stage 2: Page Rendering ──
            await _progress("rendering", 0.0, "Rendering pages...")
            start = time.time()

            async def render_progress(current, total):
                await _progress("rendering", current / total, f"Rendered {current}/{total} pages")

            page_renders = await render_all_pages(
                pdf_data, report_id, self.settings.page_render_dpi,
                self.storage, render_progress,
            )
            result["stages"]["rendering"] = {
                "duration": time.time() - start,
                "pages_rendered": len(page_renders),
                "status": "completed",
            }
            await _progress("rendering", 1.0, f"Rendered {len(page_renders)} pages")

            # Build image URI map
            image_uris = {r.page_number: r.storage_key for r in page_renders}

            # ── Stage 3: Document Parsing ──
            await _progress("parsing", 0.0, "Parsing document layout...")
            start = time.time()
            page_ids = [str(uuid.uuid4())[:8] for _ in range(metadata.page_count)]
            parsed_pages = self.parser.parse_all_pages(
                pdf_data, report_id, page_ids, image_uris,
            )
            total_components = sum(len(p.components) for p in parsed_pages)
            result["stages"]["parsing"] = {
                "duration": time.time() - start,
                "pages_parsed": len(parsed_pages),
                "total_components": total_components,
                "status": "completed",
            }
            await _progress("parsing", 1.0, f"Parsed {len(parsed_pages)} pages, {total_components} components")

            # ── Stage 4: Entity Extraction ──
            await _progress("extraction", 0.0, "Extracting sustainability entities...")
            start = time.time()
            all_entities = []
            all_relations = []
            total_pages = len(parsed_pages)

            for i, parsed_page in enumerate(parsed_pages):
                # Skip pages with very little content
                if not parsed_page.components and not parsed_page.full_text:
                    await _progress("extraction", (i + 1) / total_pages,
                                   f"Skipped page {i + 1} (empty)")
                    continue

                # Get page image for multimodal extraction
                page_image = None
                if parsed_page.image_uri and self.settings.use_multimodal:
                    try:
                        page_image = await self.storage.get_file(parsed_page.image_uri)
                    except Exception:
                        pass

                try:
                    extraction = await self.extractor.extract_from_page(
                        parsed_page, page_image, report_id,
                    )
                    all_entities.extend(extraction.entities)
                    all_relations.extend(extraction.relations)
                except Exception as e:
                    logger.error(f"Extraction failed for page {i + 1}: {e}")
                    result["errors"].append(f"Page {i + 1} extraction failed: {str(e)}")

                await _progress("extraction", (i + 1) / total_pages,
                               f"Extracted page {i + 1}/{total_pages}")

                # Rate limiting
                await asyncio.sleep(0.5)

            result["stages"]["extraction"] = {
                "duration": time.time() - start,
                "entities": len(all_entities),
                "relations": len(all_relations),
                "status": "completed",
            }
            await _progress("extraction", 1.0,
                           f"Extracted {len(all_entities)} entities, {len(all_relations)} relations")

            # ── Stage 5: Knowledge Graph Construction ──
            await _progress("graph", 0.0, "Building knowledge graph...")
            start = time.time()

            # Add report entity
            report_entity = GraphEntity(
                id=report_id,
                name=file_name,
                type=EntityType.REPORT,
                report_id=report_id,
                confidence=1.0,
                properties=metadata.to_dict(),
            )
            await self.graph.add_entity(report_entity)

            # Add page entities
            for parsed_page in parsed_pages:
                page_entity = GraphEntity(
                    id=parsed_page.page_id,
                    name=f"Page {parsed_page.page_number + 1}",
                    type=EntityType.PAGE,
                    report_id=report_id,
                    page_numbers=[parsed_page.page_number],
                    confidence=1.0,
                    properties={"component_count": len(parsed_page.components)},
                )
                await self.graph.add_entity(page_entity)
                await self.graph.add_relation(GraphRelation(
                    id=str(uuid.uuid4())[:8],
                    source_id=report_id,
                    relation=RelationType.CONTAINS_PAGE,
                    target_id=parsed_page.page_id,
                    report_id=report_id,
                    confidence=1.0,
                ))

            # Add extracted entities and relations
            for entity in all_entities:
                await self.graph.add_entity(entity)
                # Link to page
                for page_num in entity.page_numbers:
                    matching_pages = [p for p in parsed_pages if p.page_number == page_num]
                    if matching_pages:
                        await self.graph.add_relation(GraphRelation(
                            id=str(uuid.uuid4())[:8],
                            source_id=entity.id,
                            relation=RelationType.MENTIONED_ON,
                            target_id=matching_pages[0].page_id,
                            report_id=report_id,
                            confidence=entity.confidence,
                        ))

            for relation in all_relations:
                await self.graph.add_relation(relation)

            await self.graph.save()

            # Count KPIs and targets
            kpi_count = len([e for e in all_entities if e.type == EntityType.KPI])
            target_count = len([e for e in all_entities if e.type == EntityType.TARGET])
            result["entity_count"] = len(all_entities)
            result["relation_count"] = len(all_relations)
            result["kpi_count"] = kpi_count
            result["target_count"] = target_count

            result["stages"]["graph"] = {
                "duration": time.time() - start,
                "status": "completed",
            }
            await _progress("graph", 1.0, "Knowledge graph built")

            # ── Stage 6: Embedding & Indexing ──
            await _progress("embedding", 0.0, "Generating embeddings...")
            start = time.time()

            try:
                page_index = EmbeddingIndex(self.embedding_provider.dimension())
                entity_index = EmbeddingIndex(self.embedding_provider.dimension())
                lexical = LexicalRetriever()

                # Page embeddings
                page_texts = []
                page_ids_for_embed = []
                page_metas = []
                for pp in parsed_pages:
                    if pp.full_text:
                        page_texts.append(pp.full_text[:512])
                        page_ids_for_embed.append(pp.page_id)
                        page_metas.append({
                            "report_id": report_id,
                            "page_number": pp.page_number,
                            "name": f"Page {pp.page_number + 1}",
                            "type": "page",
                            "page_numbers": [pp.page_number],
                        })
                        # Also add to lexical index
                        lexical.add_document(pp.page_id, pp.full_text, page_metas[-1])

                if page_texts:
                    embeddings = self.embedding_provider.embed_text(page_texts)
                    page_index.add_batch(embeddings, page_ids_for_embed, page_metas)

                # Entity embeddings
                entity_texts = []
                entity_ids_for_embed = []
                entity_metas = []
                for entity in all_entities:
                    text = f"{entity.name}: {entity.description}" if entity.description else entity.name
                    entity_texts.append(text)
                    entity_ids_for_embed.append(entity.id)
                    entity_metas.append({
                        "report_id": report_id,
                        "name": entity.name,
                        "type": entity.type.value if isinstance(entity.type, EntityType) else entity.type,
                        "page_numbers": entity.page_numbers,
                    })
                    lexical.add_document(entity.id, text, entity_metas[-1])

                if entity_texts:
                    embeddings = self.embedding_provider.embed_text(entity_texts)
                    entity_index.add_batch(embeddings, entity_ids_for_embed, entity_metas)

                # Save indexes
                from pathlib import Path
                index_path = Path(self.settings.local_storage_path) / "embeddings" / report_id
                page_index.save(index_path / "pages")
                entity_index.save(index_path / "entities")

                result["stages"]["embedding"] = {
                    "duration": time.time() - start,
                    "page_embeddings": page_index.size,
                    "entity_embeddings": entity_index.size,
                    "status": "completed",
                }
            except Exception as e:
                logger.error(f"Embedding failed: {e}")
                result["stages"]["embedding"] = {"status": "failed", "error": str(e)}
                result["errors"].append(f"Embedding failed: {str(e)}")

            await _progress("embedding", 1.0, "Embeddings generated")

            # ── Complete ──
            await _progress("complete", 1.0, "Processing complete")
            return result

        except Exception as e:
            logger.exception(f"Pipeline failed for report {report_id}")
            result["errors"].append(str(e))
            await _progress("error", 0.0, f"Pipeline failed: {str(e)}")
            return result
