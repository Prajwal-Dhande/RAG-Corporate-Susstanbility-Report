import win32com.client
import os
import time

def build_presentation():
    base_dir = r"d:\RAG"
    final_new_path = os.path.join(base_dir, "FINAL NEW 2st SEMINAR -1 (1).pptx")
    pqai_format_path = os.path.join(base_dir, "PPT Format for PQAI.pptx")
    output_path = os.path.join(base_dir, "SustainGraph_PQAI_Presentation.pptx")

    if os.path.exists(output_path):
        os.remove(output_path)

    print("Starting PowerPoint...")
    ppt_app = win32com.client.Dispatch("PowerPoint.Application")
    # ppt_app.Visible = True # Keep it in background if possible, or True if needed.
    
    try:
        print("Opening FINAL NEW presentation...")
        prs_final = ppt_app.Presentations.Open(final_new_path, WithWindow=False)
        
        print("Opening PQAI Format presentation...")
        prs_pqai = ppt_app.Presentations.Open(pqai_format_path, WithWindow=False)

        print("Applying PQAI Template to FINAL NEW...")
        prs_final.ApplyTemplate(pqai_format_path)

        # Slides to copy from PQAI (1-indexed in VBA)
        # 6: Problem Statement
        # 8: Methodology
        # 9: Implementation
        # 13: Conclusion & Future Scope
        # 14: Publication
        # 15: Project Cost Estimation
        slides_to_copy = [6, 8, 9, 13, 14, 15]
        
        # We will paste them at the end of prs_final, then reorder if needed.
        # Actually, let's just append them to the end for now, and the user can reorder, 
        # or we can insert them at specific positions.
        # Let's insert them at appropriate positions:
        # After slide 5 (Literature Survey) -> insert Problem Statement, Methodology, Implementation
        
        print("Copying new slides from PQAI...")
        # Copy Problem statement (6)
        prs_pqai.Slides(6).Copy()
        prs_final.Slides.Paste(Index=6) # Pastes as slide 6
        
        # Copy Methodology (8)
        prs_pqai.Slides(8).Copy()
        prs_final.Slides.Paste(Index=7)
        
        # Copy Implementation (9)
        prs_pqai.Slides(9).Copy()
        prs_final.Slides.Paste(Index=8)
        
        # Copy Conclusion (13) - insert before References
        # Find where References start in prs_final (usually last 5 slides)
        ref_index = prs_final.Slides.Count - 4 # Roughly before references
        if ref_index < 1: ref_index = prs_final.Slides.Count
        
        prs_pqai.Slides(13).Copy()
        prs_final.Slides.Paste(Index=ref_index)
        
        prs_pqai.Slides(14).Copy()
        prs_final.Slides.Paste(Index=ref_index+1)
        
        prs_pqai.Slides(15).Copy()
        prs_final.Slides.Paste(Index=ref_index+2)

        print("Saving new presentation...")
        prs_final.SaveAs(output_path)
        
        prs_final.Close()
        prs_pqai.Close()
        print("Done! Created SustainGraph_PQAI_Presentation.pptx")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        ppt_app.Quit()

if __name__ == "__main__":
    build_presentation()
