import win32com.client
import os

def replace_text_in_presentation(presentation, search_text, replace_text):
    for slide in presentation.Slides:
        for shape in slide.Shapes:
            if shape.HasTextFrame:
                if search_text in shape.TextFrame.TextRange.Text:
                    shape.TextFrame.TextRange.Text = shape.TextFrame.TextRange.Text.replace(search_text, replace_text)

def populate_presentation():
    base_dir = r"d:\RAG"
    output_path = os.path.join(base_dir, "SustainGraph_PQAI_Presentation.pptx")

    print("Starting PowerPoint...")
    ppt_app = win32com.client.Dispatch("PowerPoint.Application")
    
    try:
        prs = ppt_app.Presentations.Open(output_path, WithWindow=False)

        # 1. Problem Statement
        replace_text_in_presentation(prs, "Problem identified and its justification", 
            "1. Corporate ESG reports are unstructured, dense PDFs that are difficult to analyze manually.\n"
            "2. Traditional LLMs suffer from hallucinations when extracting quantitative sustainability data.\n"
            "3. Lack of a unified, verifiable system to track and benchmark corporate climate goals over multiple years."
        )

        # 2. Methodology
        replace_text_in_presentation(prs, "Methodology", 
            "Methodology\n\n"
            "1. Document Ingestion: Parse PDFs using LlamaParse for multimodal extraction.\n"
            "2. Entity Resolution: Extract KPIs, scopes, and targets using Vision LLMs.\n"
            "3. Knowledge Graph Construction: Map relationships in Neo4j.\n"
            "4. RAG Engine: Retrieve contextually accurate answers with exact provenance."
        )

        # 3. Implementation
        replace_text_in_presentation(prs, "Implementation", 
            "Implementation Details\n\n"
            "- Frontend: Next.js, React, Recharts (for Dashboard & Benchmarking).\n"
            "- Backend: FastAPI (Python) for modular API endpoints.\n"
            "- Database: Neo4j (GraphDB) for entity relations, PostgreSQL for metadata.\n"
            "- AI Models: Llama-3, GPT-4o for structured extraction."
        )

        # 4. Conclusion & Future Scope
        replace_text_in_presentation(prs, "Conclusion of Work of the project till date", 
            "Conclusion:\n"
            "- Successfully developed a multimodal RAG pipeline.\n"
            "- Integrated Neo4j for accurate, hallucination-free querying.\n"
            "- Developed an interactive Dashboard and Evidence Explorer."
        )
        
        replace_text_in_presentation(prs, "Future Scope of the project till date", 
            "Future Scope:\n"
            "- Support for multi-lingual corporate reports.\n"
            "- Real-time web scraping for live sustainability news.\n"
            "- Advanced predictive analytics for emission forecasting."
        )

        # 5. Publication
        replace_text_in_presentation(prs, "Scan copy of first page of published paper/Certificate scan copy also achievement if any", 
            "- The project is currently in the active development and prototyping phase.\n"
            "- We plan to submit our findings on 'Multimodal RAG with Knowledge Graphs' to upcoming AI conferences."
        )

        # 6. Project Cost Estimation
        replace_text_in_presentation(prs, "Project Cost Estimation", 
            "Project Cost Estimation\n\n"
            "- Cloud Infrastructure: Vercel (Frontend) - Free Tier.\n"
            "- Database Hosting: Neo4j AuraDB - Free Tier.\n"
            "- API Costs (OpenAI/Groq): ~$10 for initial prototyping.\n"
            "- Total Estimated Cost: Minimal, heavily utilizing open-source and student packs."
        )

        print("Saving populated presentation...")
        prs.Save()
        prs.Close()
        print("Done populating text!")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        ppt_app.Quit()

if __name__ == "__main__":
    populate_presentation()
