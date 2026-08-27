"""
Sustainability MMKG-RAG: Document Pipeline — PDF Parser

Multi-strategy PDF parsing pipeline:
1. Primary: PyMuPDF text + layout extraction
2. Fallback: PaddleOCR for scanned pages
3. Future: MinerU for advanced layout detection

Extracts paragraphs, tables, figures, and their spatial layout.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Optional

import fitz  # PyMuPDF

logger = logging.getLogger(__name__)


@dataclass
class BBox:
    """Bounding box in PDF coordinates."""
    x0: float
    y0: float
    x1: float
    y1: float

    def to_list(self) -> list[float]:
        return [self.x0, self.y0, self.x1, self.y1]

    @property
    def width(self) -> float:
        return self.x1 - self.x0

    @property
    def height(self) -> float:
        return self.y1 - self.y0

    @property
    def area(self) -> float:
        return self.width * self.height


@dataclass
class ParsedComponent:
    """A parsed document component (paragraph, table, figure, etc.)."""
    id: str
    type: str  # paragraph, table, figure, chart, caption, header, footer
    bbox: BBox
    text: Optional[str] = None
    structured_data: Optional[dict] = None
    image_uri: Optional[str] = None
    caption: Optional[str] = None
    confidence: float = 1.0

    def to_dict(self) -> dict:
        result = {
            "id": self.id,
            "type": self.type,
            "bbox": self.bbox.to_list(),
        }
        if self.text is not None:
            result["text"] = self.text
        if self.structured_data is not None:
            result["structured_data"] = self.structured_data
        if self.image_uri is not None:
            result["image_uri"] = self.image_uri
        if self.caption is not None:
            result["caption"] = self.caption
        result["confidence"] = self.confidence
        return result


@dataclass
class ParsedPage:
    """Complete parsed representation of a PDF page."""
    report_id: str
    page_id: str
    page_number: int
    width: float
    height: float
    image_uri: Optional[str] = None
    components: list[ParsedComponent] = field(default_factory=list)
    full_text: str = ""
    has_extractable_text: bool = True
    parse_method: str = "pymupdf"

    def to_dict(self) -> dict:
        """Convert to canonical page JSON (Section 8 of spec)."""
        return {
            "report_id": self.report_id,
            "page_id": self.page_id,
            "page_number": self.page_number,
            "width": self.width,
            "height": self.height,
            "image_uri": self.image_uri,
            "components": [c.to_dict() for c in self.components],
            "full_text": self.full_text,
            "has_extractable_text": self.has_extractable_text,
            "parse_method": self.parse_method,
        }

    @property
    def paragraphs(self) -> list[ParsedComponent]:
        return [c for c in self.components if c.type == "paragraph"]

    @property
    def tables(self) -> list[ParsedComponent]:
        return [c for c in self.components if c.type == "table"]

    @property
    def figures(self) -> list[ParsedComponent]:
        return [c for c in self.components if c.type in ("figure", "chart")]


class PDFParser:
    """
    Multi-strategy PDF parser.

    Currently implements PyMuPDF-based extraction.
    Designed for extension with MinerU and PaddleOCR.
    """

    def __init__(self):
        self._counters = {}

    def _next_id(self, page_num: int, component_type: str) -> str:
        """Generate sequential component IDs per page."""
        prefix_map = {
            "paragraph": "P",
            "table": "T",
            "figure": "IM",
            "chart": "CH",
            "caption": "CAP",
            "header": "H",
            "footer": "FT",
        }
        prefix = prefix_map.get(component_type, "C")
        key = f"{page_num}_{prefix}"
        self._counters[key] = self._counters.get(key, 0) + 1
        return f"{prefix}{self._counters[key]}"

    def parse_page(
        self,
        pdf_data: bytes,
        page_number: int,
        report_id: str,
        page_id: str,
        image_uri: Optional[str] = None,
    ) -> ParsedPage:
        """
        Parse a single PDF page.

        Extracts:
        - Text blocks as paragraphs
        - Tables (via PyMuPDF table finder)
        - Images/figures
        - Reading order (top-to-bottom, left-to-right)
        """
        doc = fitz.open(stream=pdf_data, filetype="pdf")
        try:
            page = doc[page_number]
            self._counters = {}  # Reset per page

            components = []
            full_text_parts = []

            # Get page dimensions
            rect = page.rect
            width = rect.width
            height = rect.height

            # --- Extract tables ---
            tables = self._extract_tables(page, page_number)
            table_rects = [fitz.Rect(t.bbox.to_list()) for t in tables]
            components.extend(tables)

            # --- Extract images/figures ---
            figures = self._extract_figures(page, page_number)
            figure_rects = [fitz.Rect(f.bbox.to_list()) for f in figures]
            components.extend(figures)

            # --- Extract text blocks (excluding table/figure regions) ---
            text_blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)
            for block in text_blocks.get("blocks", []):
                if block.get("type") != 0:  # Skip image blocks
                    continue

                block_rect = fitz.Rect(block["bbox"])

                # Skip if this block overlaps with a table or figure
                if any(block_rect.intersects(tr) for tr in table_rects):
                    continue
                if any(block_rect.intersects(fr) for fr in figure_rects):
                    continue

                # Combine lines in the block
                text = ""
                for line in block.get("lines", []):
                    line_text = ""
                    for span in line.get("spans", []):
                        line_text += span.get("text", "")
                    text += line_text.strip() + "\n"

                text = text.strip()
                if not text or len(text) < 3:
                    continue

                # Classify: header, paragraph, caption
                comp_type = self._classify_text_block(text, block, height)

                comp = ParsedComponent(
                    id=self._next_id(page_number, comp_type),
                    type=comp_type,
                    bbox=BBox(*block["bbox"]),
                    text=text,
                )
                components.append(comp)
                full_text_parts.append(text)

            # Sort by reading order (top-to-bottom, then left-to-right)
            components.sort(key=lambda c: (c.bbox.y0, c.bbox.x0))

            # Check if page has extractable text
            has_text = len(full_text_parts) > 0 and any(len(t) > 20 for t in full_text_parts)

            full_text = "\n\n".join(full_text_parts)

            return ParsedPage(
                report_id=report_id,
                page_id=page_id,
                page_number=page_number,
                width=width,
                height=height,
                image_uri=image_uri,
                components=components,
                full_text=full_text,
                has_extractable_text=has_text,
                parse_method="pymupdf",
            )
        finally:
            doc.close()

    def _extract_tables(self, page: fitz.Page, page_number: int) -> list[ParsedComponent]:
        """Extract tables using PyMuPDF's table finder."""
        components = []
        try:
            tables = page.find_tables()
            for table in tables:
                # Extract table data
                data = table.extract()

                # Build structured data
                headers = data[0] if data else []
                rows = data[1:] if len(data) > 1 else []

                structured = {
                    "headers": headers,
                    "rows": rows,
                    "row_count": len(rows),
                    "col_count": len(headers) if headers else 0,
                }

                # Build text representation
                text_parts = []
                if headers:
                    text_parts.append(" | ".join(str(h) if h else "" for h in headers))
                for row in rows:
                    text_parts.append(" | ".join(str(c) if c else "" for c in row))

                comp = ParsedComponent(
                    id=self._next_id(page_number, "table"),
                    type="table",
                    bbox=BBox(*table.bbox),
                    text="\n".join(text_parts),
                    structured_data=structured,
                )
                components.append(comp)
        except Exception as e:
            logger.warning(f"Table extraction failed on page {page_number}: {e}")

        return components

    def _extract_figures(self, page: fitz.Page, page_number: int) -> list[ParsedComponent]:
        """Extract image/figure regions from the page."""
        components = []
        try:
            images = page.get_images(full=True)
            for img_info in images:
                xref = img_info[0]
                try:
                    # Get image bbox by finding where it's referenced
                    img_rects = page.get_image_rects(xref)
                    for rect in img_rects:
                        if rect.is_empty or rect.is_infinite:
                            continue

                        # Skip very small images (likely icons/bullets)
                        if rect.width < 50 or rect.height < 50:
                            continue

                        comp_type = "figure"

                        comp = ParsedComponent(
                            id=self._next_id(page_number, comp_type),
                            type=comp_type,
                            bbox=BBox(rect.x0, rect.y0, rect.x1, rect.y1),
                        )
                        components.append(comp)
                except Exception:
                    continue

        except Exception as e:
            logger.warning(f"Figure extraction failed on page {page_number}: {e}")

        return components

    def _classify_text_block(self, text: str, block: dict, page_height: float) -> str:
        """Classify a text block as header, paragraph, caption, etc."""
        bbox = block["bbox"]
        y_center = (bbox[1] + bbox[3]) / 2

        # Check font size from spans
        max_font_size = 0
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                max_font_size = max(max_font_size, span.get("size", 12))

        # Headers: large font or at top of page
        if max_font_size > 16 and len(text) < 200:
            return "header"

        # Captions: short text near figures, often starts with "Figure", "Table", "Source"
        caption_pattern = re.compile(
            r"^(figure|table|chart|graph|source|note|exhibit)\s",
            re.IGNORECASE
        )
        if caption_pattern.match(text.strip()) and len(text) < 300:
            return "caption"

        # Footers: very bottom of page
        if y_center > page_height * 0.95 and len(text) < 100:
            return "footer"

        return "paragraph"

    def parse_all_pages(
        self,
        pdf_data: bytes,
        report_id: str,
        page_ids: Optional[list[str]] = None,
        image_uris: Optional[dict[int, str]] = None,
    ) -> list[ParsedPage]:
        """Parse all pages of a PDF."""
        doc = fitz.open(stream=pdf_data, filetype="pdf")
        total_pages = doc.page_count
        doc.close()

        results = []
        for i in range(total_pages):
            page_id = page_ids[i] if page_ids and i < len(page_ids) else f"{report_id}_p{i + 1}"
            img_uri = (image_uris or {}).get(i)
            try:
                parsed = self.parse_page(pdf_data, i, report_id, page_id, img_uri)
                results.append(parsed)
                logger.info(
                    f"Parsed page {i + 1}/{total_pages}: "
                    f"{len(parsed.components)} components"
                )
            except Exception as e:
                logger.error(f"Failed to parse page {i + 1}: {e}")
                # Create empty parsed page rather than skip
                results.append(ParsedPage(
                    report_id=report_id,
                    page_id=page_id,
                    page_number=i,
                    width=0,
                    height=0,
                    image_uri=img_uri,
                    has_extractable_text=False,
                    parse_method="failed",
                ))

        return results
