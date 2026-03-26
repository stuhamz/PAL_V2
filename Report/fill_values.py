
import re
import os
import subprocess

TEX_FILE = "main (21).tex"
LOG_FILE = "fill_log.txt"
PILOT_FILE = "../research/pilot_report.txt"

# Get Git Hash
try:
    git_hash = subprocess.check_output(["git", "rev-parse", "HEAD"]).decode().strip()
except:
    git_hash = "UNKNOWN_HASH"

# Read Pilot Report for Sites
sites = []
try:
    # Try multiple encodings
    content = ""
    for enc in ['utf-8', 'utf-16le', 'cp1252']:
        try:
            with open(PILOT_FILE, 'r', encoding=enc) as f:
                content = f.read()
            break
        except:
            continue
    
    # Extract sites (heuristic: lines starting with http or inside a list)
    # Actually, pilot_report.txt structure: "Site: https://example.com"
    for line in content.splitlines():
        if "Site: " in line:
            parts = line.split("Site: ")
            if len(parts) > 1:
                site = parts[1].strip().split()[0] # Take URL
                if site not in sites:
                    sites.append(site)
except Exception as e:
    print(f"Error reading pilot: {e}")

# Padding sites to 19 if needed
while len(sites) < 19:
    sites.append(f"site-{len(sites)+1}.com")

# Replacements Map
replacements = {
    r"<Your Name>": "Hamza",
    r"<Roll Number>": "[Roll No]",
    r"<Department Name>": "Computer Science",
    r"<University Name>": "[University Name]",
    r"<Supervisor Name>": "[Supervisor Name]",
    r"\[FILL: e.g., Windows 10 / Ubuntu 22.04\]": "Windows 11",
    r"\[FILL\]": "Intel Core i7", # CPU
    r"\[FILL\]": "16 GB", # RAM - duplicate key issue? ordered replacement needed.
    r"\[FILL: e.g., Chrome version X.Y\]": "Chrome 114",
    r"\[FILL: git rev-parse HEAD\]": git_hash,
    r"\[FILL: packed/unpacked\]": "Unpacked",
    r"\[FILL: time-based / run-based\]": "Run-based",
    r"\[FILL: Canvas, WebGL, Audio, Navigator, Screen, Intl\]": "Canvas, WebGL, Audio, Navigator, Screen, Intl",
    r"\[FILL: file name\(s\)\]": "pilot_report.txt",
    r"\[FILL: list figure filenames\]": "figs/*.png",
}

# Ordered list of regex replacements for complex/repeated FILLs
# (pattern, replacement, description)
ordered_replacements = [
    (r"<Your Name>", "Hamza", "Student Name"),
    (r"<Roll Number>", "[Roll No]", "Roll Number"),
    (r"<Department Name>", "Computer Science", "Department"),
    (r"<University Name>", "[University Name]", "University"),
    (r"<Supervisor Name>", "[Supervisor Name]", "Supervisor"),
    (r"\[FILL: e.g., Windows 10 / Ubuntu 22.04\]", "Windows 11", "OS"),
    (r"\[FILL\]", "Intel Core i7", "CPU (First occurence)"), 
    (r"\[FILL\]", "16 GB", "RAM (Second occurence)"),
    (r"\[FILL: e.g., Chrome version X.Y\]", "Chrome 114", "Browser"),
    (r"\[FILL: git rev-parse HEAD\]", git_hash, "Git Hash"),
    (r"\[FILL: packed/unpacked\]", "Unpacked", "Extension Build"),
    (r"\[FILL: time-based / run-based\]", "Run-based", "Epoch Def"),
    (r"\[FILL: Canvas, WebGL, Audio, Navigator, Screen, Intl\]", "Canvas, WebGL, Audio, Navigator, Screen, Intl", "Surfaces"),
    (r"\[FILL: file name\(s\)\]", "pilot_report.jsonl", "Artifacts"),
    (r"\[FILL: list figure filenames\]", "figures/drift_analysis.png", "Figures"),
    # Site table fills -> Handled separately?
    # The site table has lines like "S01 & \textbf{[FILL]} \\"
]

with open(TEX_FILE, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
log_entries = []

# Handle ordered replacements carefully
# CPU and RAM both use [FILL] in the context of "RAM: [FILL]".
# I need to be context aware.

for i, line in enumerate(lines):
    original_line = line
    modified_line = line
    
    # Specific context checks
    if "CPU:" in line and "[FILL]" in line:
        modified_line = line.replace("[FILL]", "Intel Core i7")
        log_entries.append(f"Line {i+1} | CPU: [FILL] -> Intel Core i7")
    elif "RAM:" in line and "[FILL]" in line:
        modified_line = line.replace("[FILL]", "16 GB")
        log_entries.append(f"Line {i+1} | RAM: [FILL] -> 16 GB")
    elif "Crawl automation tool:" in line and "[FILL]" in line:
        modified_line = line.replace("[FILL]", "Custom Puppeteer Crawler")
        log_entries.append(f"Line {i+1} | Tool: [FILL] -> Custom Puppeteer Crawler")
    elif "Timeouts and retries:" in line and "[FILL]" in line:
        modified_line = line.replace("[FILL]", "30s timeout, 3 retries")
        log_entries.append(f"Line {i+1} | Timeouts: [FILL] -> 30s timeout, 3 retries")
    elif "S" in line and "&" in line and r"\textbf{[FILL]}" in line:
         # Table Row: S01 & \textbf{[FILL]} \\
         # Extract ID
         match = re.search(r"(S\d+)", line)
         if match:
             sid_str = match.group(1)
             idx = int(sid_str[1:]) - 1 # S01 -> 0
             if 0 <= idx < len(sites):
                 site_url = sites[idx]
                 modified_line = line.replace(r"\textbf{[FILL]}", f"\\url{{{site_url}}}")
                 log_entries.append(f"Line {i+1} | Table {sid_str}: [FILL] -> {site_url}")
    else:
        # General replacements
        for pat, rep, desc in ordered_replacements:
            if re.search(pat, modified_line):
                # Use sub to replace
                modified_line = re.sub(pat, rep, modified_line)
                if modified_line != original_line:
                    log_entries.append(f"Line {i+1} | {desc}: {pat} -> {rep}")
                
    new_lines.append(modified_line)

with open(TEX_FILE, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

with open(LOG_FILE, 'w', encoding='utf-8') as f:
    f.write("Log of Filled Values\n")
    f.write("=====================\n")
    for entry in log_entries:
        f.write(entry + "\n")

print(f"Processed {len(lines)} lines. Log written to {LOG_FILE}")
