
import os

SOURCE_FILE = "main (22).tex"
TARGET_FILE = "main (21).tex"

def read_lines(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        return f.readlines()

def get_block(lines, start, end):
    # User provided 1-based inclusive indices.
    # Python uses 0-based exclusive.
    # So start -> start-1, end -> end
    return lines[start-1:end]

def main():
    if not os.path.exists(SOURCE_FILE):
        print(f"Error: {SOURCE_FILE} not found.")
        return

    lines = read_lines(SOURCE_FILE)
    print(f"Read {len(lines)} lines from {SOURCE_FILE}")

    # Assembly Plan
    chunks = []
    
    # Preamble (Lines 1-114) - Inferred but necessary
    chunks.extend(get_block(lines, 1, 114))

    # Chapter 1
    chunks.extend(get_block(lines, 115, 219))

    # Chapter 2
    # Be careful with headers. The user said "This chapter should merge..."
    # The first block (220-327) likely has the chapter header "BACKGROUND AND PROBLEM STATEMENT"
    # The user wants "BACKGROUND AND RELATED WORK".
    # I will stick to the user's content first, then perhaps I need to patch the title.
    # "Result: Chapter 2 contains both background + related work material."
    # The user said: "Use block A... Use block B..."
    # If block A has \chapter{...}, I might need to rename it to "BACKGROUND AND RELATED WORK".
    # I will inspect this in a second script or just apply a replacement after assembly. 
    # For now, raw assembly.
    chunks.extend(get_block(lines, 220, 327))
    chunks.extend(get_block(lines, 3480, 3598))

    # Chapter 3
    chunks.extend(get_block(lines, 328, 613))
    chunks.extend(get_block(lines, 2740, 2926))

    # Chapter 4
    chunks.extend(get_block(lines, 2059, 2277))

    # Chapter 5
    chunks.extend(get_block(lines, 871, 1179))

    # Chapter 6
    chunks.extend(get_block(lines, 614, 870))
    chunks.extend(get_block(lines, 2927, 3189))

    # Chapter 7
    chunks.extend(get_block(lines, 1180, 1440))
    chunks.extend(get_block(lines, 1441, 1704))
    chunks.extend(get_block(lines, 2485, 2588))
    
    # Chapter 8
    chunks.extend(get_block(lines, 1705, 2058))

    # Chapter 9
    chunks.extend(get_block(lines, 2278, 2484))

    # Chapter 10
    chunks.extend(get_block(lines, 3190, 3414))
    chunks.extend(get_block(lines, 3599, 3630))

    # Chapter 11
    chunks.extend(get_block(lines, 3415, 3479))

    # References
    # "Use: Lines 3959 to 3992... do NOT keep \chapter{REFERENCES}"
    ref_block = get_block(lines, 3959, 3992)
    filtered_refs = [line for line in ref_block if "\\chapter{REFERENCES}" not in line]
    chunks.extend(filtered_refs)

    # Appendices
    # "Remove this wrapper chapter entirely: Lines 3631 to 3634" -> Skipped.
    # "After \appendix, include these blocks as appendix chapters"
    chunks.append("\n\\appendix\n")
    
    # Appendix A
    # "Appendix A (Formal metric definitions / formulas): Lines 2589 to 2739"
    # "this is the “Formal Metrics” part of the earlier chapter you split"
    # This block likely doesn't have a \chapter{} command since it was part of a chapter?
    # Or maybe it does? I will wrap it in \chapter{METRIC DEFINITIONS} if needed later, but the user plan implies content moves.
    # Actually, if it was part of "PROBLEM DEFINITION AND FORMAL METRICS", it might be a \section.
    # The user instruction says: "After \appendix, include these blocks as appendix chapters: Appendix A ... Lines 2589 to 2739"
    # I should probably insert the chapter command myself if not present.
    # For safe reassembly, I will insert the header explicitly for Appendices A-E to ensure they are chapters.
    
    chunks.append("\n\\chapter{FORMAL METRIC DEFINITIONS}\n") 
    chunks.extend(get_block(lines, 2589, 2739))

    # Appendix B
    chunks.append("\n\\chapter{METRIC COMPUTATION DETAILS}\n")
    chunks.extend(get_block(lines, 3635, 3804))

    # Appendix C
    chunks.append("\n\\chapter{EXPERIMENTAL CONFIGURATION}\n")
    chunks.extend(get_block(lines, 3805, 3864))

    # Appendix D
    chunks.append("\n\\chapter{SITE LIST}\n")
    chunks.extend(get_block(lines, 3865, 3896))

    # Appendix E
    chunks.append("\n\\chapter{ERROR TAXONOMY}\n")
    chunks.extend(get_block(lines, 3897, 3958))

    chunks.append("\n\\end{document}\n")

    with open(TARGET_FILE, 'w', encoding='utf-8') as f:
        f.writelines(chunks)
    
    print(f"Successfully wrote {len(chunks)} chunks/lines to {TARGET_FILE}")

if __name__ == "__main__":
    main()
