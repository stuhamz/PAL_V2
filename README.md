# PAL V2: Privacy & Linkability Research Framework

**PAL (Psychological Anonymity Linkability)** is a research-grade browser extension and automated crawler system designed to evaluate, harden, and verify anti-fingerprinting defenses in modern web environments. Unlike standard privacy tools, PAL is built on a rigorous **Gate-Based Research Pipeline**, ensuring that defenses are not just "random" but mathematically consistent and verifiable against ad-tech linking.

---

## 1. What is this tool about?
PAL solves the "Consistency vs. Privacy" trade-off. Most anti-fingerprinting tools either:
- **Break websites** by returning inconsistent or "fake" data that triggers fraud detection.
- **Fail to protect** because their noise is too predictable or doesn't cover all contexts (i.e., Web Workers, Iframes).

**PAL's Solution: Epoch-Coupled Noise**
PAL injects deterministic noise seeded by a combination of `(Identity + Epoch + Content)`.
- **Inside an Epoch (Session):** The fingerprint is perfectly stable. Websites don't break because the data remains consistent.
- **Across Epochs:** The fingerprint "drifts" (changes). To a tracker, you look like a completely new person every time the epoch changes, breaking long-term linkability.

---

## 2. Important Project Directory
Only the core components necessary for research and deployment:

```text
PAL/
├── src/                  # The Extension Source
│   ├── content/          # Core payload injection (prehook.js)
│   └── background/       # Persona & Seed management
├── research/             # The Research Suite
│   ├── crawler_research.js # The Gate-Runner (Automated testing)
│   ├── research_probe.js   # Deterministic FP measurement script
│   └── worker_noise.js     # Standalone injector for Web Workers
├── tools/                # Analysis & Verification
│   └── research_gate_evaluator.js # Automated PASS/FAIL validator
└── data/                 # Telemetry Storage
    ├── runs/               # JSONL results from crawls
    └── gold_reference/      # The baseline "Ground Truth" for regression
```

---

## 3. How to use the tools
### For Developers: Extension Setup
1. Open Chrome -> `chrome://extensions`
2. Enable **Developer Mode**.
3. Click **Load Unpacked** and select the `PAL/` root folder.
4. Use the popup to switch the tool on. 

### For Researchers: Running an Automated Crawl
The crawler uses Playwright to visit sites and collect telemetry automatically.
```bash
# Install dependencies
npm install

# Run a research crawl
# (Set TARGET_COUNT in crawler_research.js to 50 for a full run)
node research/crawler_research.js
```

---

## 4. Large-Scale Testing (Gate 4)
We verify PAL using a **5-Gate Pipeline**. The latest **Gate 4 (Full Pilot)** tested PAL across 50 diverse sites (Fingerprinting labs, Ad-tech, E-commerce, Social Media).

### **Gate 4 Summary Results (Run: `9cfad97a...`)**
| Context | Sites Tracked | Privacy Drift | Compat Stability | Result |
| :--- | :--- | :--- | :--- | :--- |
| **Top-Level** | 44/44 | **100%** | **100%** | ✅ PASS |
| **Web Workers** | 40/40 | **100%** | **100%** | ✅ PASS |
| **Iframes** | 23/29 | **85%** | **100%** | ✅ PASS |

**Key Performance Metrics:**
- **Error Rate:** 13.8% (Target: < 40%)
- **Avg Probe Time:** 43.1ms (Ultra-low overhead)
- **Zero Drift in Compat Mode:** Guaranteed zero breakage for legacy/sensitive sites.

---

## 5. How to Verify Claims & Results
To verify that PAL is actually protecting you and not just breaking things, run the automated evaluator:

1. **Perform a run:** `node research/crawler_research.js`
2. **Evaluate the run:**
   ```bash
   # Replace <RUN_ID> with the folder name in data/runs/
   node tools/research_gate_evaluator.js <RUN_ID>
   ```
3. **What to look for:**
   - **Vanilla/Compat Drift:** MUST be **0%**. Any drift here is a "Regression" (the tool is unstable).
   - **Privacy Drift:** MUST be **> 80%**. Any stability here is a "Leak" (trackers can see through the noise).

---

## 6. Why do we need this?
In the current web landscape, your browser fingerprint is a permanent, silent ID.
- **Anti-Tracking isn't enough:** Blocking cookies is trivial; fingerprinting is probabilistic and happens at the hardware level (Canvas, WebGL, Audio).
- **The "Linkability" Problem:** Even if you use a VPN or delete cookies, your "Canvas Hash" stays the same. The ad-tech graph can "re-link" your new IP/Session back to your old profile.
- **The Hybrid Solution:** People need a tool that **drifts** their identity consistently so that no single "shadow profile" can follow them for more than a few days, without the tool being detected as "faking data" or "hiding activity."

**PAL is designed for researchers, whistleblowers, and privacy-conscious users who require verifiable, state-of-the-art protection.**

---
*Created by stuhamz | PAL V2 Project*
