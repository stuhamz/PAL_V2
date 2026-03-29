# PAL V2

PAL V2 is a browser extension plus a research harness for studying fingerprint stability, compatibility, and privacy drift across modern browser contexts.

This repository contains two live parts.

- a Manifest V3 browser extension that applies fingerprint-related overrides
- a Puppeteer-based research runner that launches Chromium, visits target sites, collects telemetry, and evaluates gate outcomes

## What the live gate currently measures

The current formal gate is based on these surfaces.

- Canvas
- WebGL

Audio is still collected and reported in telemetry and in summary tables, but it is not part of the formal pass or fail verdict in the current evaluator.

The current formal context policy is.

- top context is strict
- worker context is strict
- iframe context is threshold-based

The evaluator compares the first epoch against the last epoch in a run.

## Live files that matter for reviewers

Reviewers can ignore most legacy and debug files and focus on this path.

```text
package.json
manifest.json
src/
  background/
    service_worker.js
    net.js
    policy.js
  content/
    loader.js
    prehook.js
  lib/
    blueprints.js
    persona.js
  popup/
    popup.html
    popup.js
    popup.css
research/
  crawler_research.js
  research_probe.js
  worker_noise.js
  data_analysis.js
tools/
  research_gate_evaluator.js
```

## Requirements

- Google Chrome or Chromium
- Node.js
- npm

## Install dependency

The public repo may not yet include a package manifest. If so, install the one required dependency manually from the repo root.

```bash
git clone https://github.com/stuhamz/PAL_V2.git
cd PAL_V2
npm init -y
npm install puppeteer
```

If a `package.json` is later added, reviewers can just run `npm install` instead.

## Load the extension

The unpacked extension root is the repository root.

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click **Load unpacked**
4. Select the repository root folder

Do not select `src` as the extension root.

## Quick manual check

After loading the extension.

1. open any normal website
2. open the extension popup
3. confirm that the popup shows an active identity
4. press **Shift Identity** if you want to check site-scoped persona rotation

## Run the Gate 4 crawl

From the repo root run.

```bash
node research/crawler_research.js
```

The crawler is currently configured for.

- 50 target sites
- 3 modes
- 3 epochs

The three modes are.

- `vanilla`
- `compat`
- `privacy`

## What the crawler does

For each target site, the crawler.

- launches Chromium
- loads the extension for protected modes
- injects run configuration before navigation
- collects telemetry from top frames, iframes, and workers
- writes JSONL events to a run folder

## Output location

Each run is written to.

```text
data/runs/<RUN_ID>/run_<RUN_ID>.jsonl
```

The latest run id is also written to.

```text
data/runs/latest_run.txt
```

## Evaluate a run

Run the evaluator like this.

```bash
node tools/research_gate_evaluator.js <RUN_ID>
```

An optional baseline run id can also be passed.

```bash
node tools/research_gate_evaluator.js <RUN_ID> <GOLD_RUN_ID>
```

The baseline is optional. The evaluator can now run without any gold file.

## What the evaluator enforces

The evaluator checks.

- error rate
- average probe time
- stability in `vanilla`
- stability in `compat`
- drift in `privacy`

Formal gate policy.

- `top` plus `worker`
  - strict for Canvas and WebGL
- `iframe`
  - threshold-based for Canvas and WebGL
- `audio`
  - reported but not used in the formal verdict

## Run the secondary analysis pass

```bash
node research/data_analysis.js <RUN_ID>
```

This produces a secondary summary from the stored JSONL run.

## What reviewers should look for

For a good run, reviewers should expect.

- `vanilla` top and worker Canvas and WebGL to stay stable
- `compat` top and worker Canvas and WebGL to stay stable
- `privacy` top and worker Canvas and WebGL to drift
- iframe drift or stability to clear the configured threshold rather than requiring perfection
- moderate error rate rather than zero errors, because broad real-world crawling produces site-specific failures

## Main telemetry shape

The main event type is `fingerprint_vector`.

Typical fields include.

- `event_type`
- `mode`
- `epoch`
- `context`
- `url`
- `components`
- `timings`
- `run_id`
- `ts`

`error` events may also appear when a page fails to load or execute cleanly.

## Reviewer path in one block

If a reviewer wants the shortest path.

```bash
git clone https://github.com/stuhamz/PAL_V2.git
cd PAL_V2
npm init -y
npm install puppeteer
node research/crawler_research.js
node tools/research_gate_evaluator.js <RUN_ID>
node research/data_analysis.js <RUN_ID>
```

## Notes

This repository still contains legacy, debug, and paper-related files outside the live gate path. Reviewers should treat the files listed in the live reviewer path above as the maintained runtime flow.

The intended entry points for current evaluation are.

- `research/crawler_research.js`
- `tools/research_gate_evaluator.js`
- `research/data_analysis.js`
