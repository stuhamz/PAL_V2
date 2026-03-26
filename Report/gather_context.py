
import os
import subprocess

def read_file_safe(path):
    for enc in ['utf-8', 'utf-16le', 'cp1252']:
        try:
            with open(path, 'r', encoding=enc) as f:
                return f.read()
        except Exception:
            continue
    return "Error reading file"

print("--- PLACEHOLDERS ---")
print(read_file_safe("placeholders.txt"))

print("\n--- PILOT REPORT SUMMARY ---")
content = read_file_safe("../research/pilot_report.txt")
lines = content.splitlines()
for line in lines[:20]: # Header stats
    print(line)

print("\n--- SITE LIST (Sample) ---")
# Look for site lines
sites = [l for l in lines if "Site:" in l or "http" in l]
for s in sites[:25]:
    print(s)

print("\n--- GIT HASH ---")
try:
    print(subprocess.check_output(["git", "rev-parse", "HEAD"]).decode().strip())
except:
    print("Git error")
