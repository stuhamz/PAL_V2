
import re

TEX_FILE = "main (21).tex"

# Direct line replacements based on the user request to NOT fill 62-66 and NOT use random data.
# I will revert the personal block and the hardware spec block to their original state.

with open(TEX_FILE, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 0-indexed adjustment for lines 62-66 (1-based in editor)
# Lines 62-66 in 1-based are indices 61-65.
# Original content from main (22).tex (or similar):
# \newcommand{\StudentName}{<Your Name>}
# \newcommand{\RollNo}{<Roll Number>}
# \newcommand{\Department}{<Department Name>}
# \newcommand{\University}{<University Name>}
# \newcommand{\Supervisor}{<Supervisor Name>}

# I will force these specific lines to revert.
lines[61] = "\\newcommand{\\StudentName}{<Your Name>}\n"
lines[62] = "\\newcommand{\\RollNo}{<Roll Number>}\n"
lines[63] = "\\newcommand{\\Department}{<Department Name>}\n"
lines[64] = "\\newcommand{\\University}{<University Name>}\n"
lines[65] = "\\newcommand{\\Supervisor}{<Supervisor Name>}\n"

# Revert random hardware specs (Lines ~3849-3852 based on log)
# I'll search for the filled values and revert them to [FILL]
# "OS: \textbf{Windows 11}" -> "OS: \textbf{[FILL: e.g., Windows 10 / Ubuntu 22.04]}"
# "CPU: \textbf{Intel Core i7}" -> "CPU: \textbf{[FILL]}"
# "RAM: \textbf{16 GB}" -> "RAM: \textbf{[FILL]}"
# "Browser: \textbf{Chrome 114}" -> "Browser: \textbf{[FILL: e.g., Chrome version X.Y]}"

for i in range(len(lines)):
    if "OS: \\textbf{Windows 11}" in lines[i]:
        lines[i] = "    \\item OS: \\textbf{[FILL: e.g., Windows 10 / Ubuntu 22.04]}\n"
    elif "CPU: \\textbf{Intel Core i7}" in lines[i]:
        lines[i] = "    \\item CPU: \\textbf{[FILL]}\n"
    elif "RAM: \\textbf{16 GB}" in lines[i]:
        lines[i] = "    \\item RAM: \\textbf{[FILL]}\n"
    elif "Browser: \\textbf{Chrome 114}" in lines[i]:
        lines[i] = "    \\item Browser: \\textbf{[FILL: e.g., Chrome version X.Y]}\n"
    
    # Revert dummy sites if they exist (site-X.com)
    # Pattern: \url{site-X.com} -> \textbf{[FILL]}
    if "site-" in lines[i] and ".com" in lines[i] and "\\url{" in lines[i]:
        lines[i] = re.sub(r"\\url\{site-\d+\.com\}", r"\\textbf{[FILL]}", lines[i])

with open(TEX_FILE, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Reverted lines 62-66 and hardware placeholders.")
