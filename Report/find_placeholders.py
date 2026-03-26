
import re

filename = "main (21).tex"

patterns = [
    r"FILL",
    r"<[^>]+>",  # Matches <Your Name>
    r"\[FILL.*?\]" # Matches [FILL: description]
]

with open(filename, 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"{'Line':<6} | {'Content':<60}")
print("-" * 70)

for i, line in enumerate(lines):
    line_num = i + 1
    # Check for keywords
    if "FILL" in line or ("<" in line and ">" in line and "\\" not in line): # Simple heuristic for <Placeholders>
        print(f"{line_num:<6} | {line.strip()[:60]}")
