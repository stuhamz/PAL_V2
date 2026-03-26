const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// --- Configuration ---
const SITES_FILE = path.join(__dirname, 'sites_structured.json');
const EXTENSION_PATH = path.resolve(__dirname, '../');
const RESEARCH_PROBE_PATH = path.join(__dirname, 'research_probe.js');
const DATA_DIR = path.resolve(__dirname, '../data/runs');

// --- RESUME CONFIGURATION ---
const TARGET_COUNT = 100;
const EPOCHS = 3;
const MODES = ['vanilla', 'compat', 'privacy'];
const RUN_ID = '1dfd869d-5fcf-4fcf-a6c4-2d97f9df8154'; // <--- RESUMING THIS RUN

const RUN_DIR = path.join(DATA_DIR, RUN_ID);
const EVENTS_FILE = path.join(RUN_DIR, `run_${RUN_ID}.jsonl`);

// --- Persistent Write Stream (Fixes EBUSY) ---
const stream = fs.createWriteStream(EVENTS_FILE, { flags: 'a' });

function appendJSONL(data) {
    if (!stream.write(JSON.stringify(data) + '\n')) {
        // Handle backpressure if needed, but for logs it's usually fine
    }
}

(async () => {
    console.log(`Resuming Research Crawl ${RUN_ID}`);

    // 0. Build Resume Set
    // 0. Build Resume Set
    const completed = new Set();
    const readline = require('readline'); // ensure import
    if (fs.existsSync(EVENTS_FILE)) {
        console.log("Analyzing existing data to resume...");
        const fileStream = fs.createReadStream(EVENTS_FILE);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        for await (const line of rl) {
            if (!line.trim()) continue;
            try {
                const r = JSON.parse(line);
                if (r.mode && r.epoch && r.url && (r.event_type !== 'error' && r.type !== 'error')) {
                    completed.add(`${r.mode}|${r.epoch}|${r.url}`);
                }
            } catch (e) { }
        }
    }
    console.log(`Found ${completed.size} completed visits. Skipping them.`);

    // 1. Load Sites
    const sitesRaw = JSON.parse(fs.readFileSync(SITES_FILE, 'utf8'));
    const urls = sitesRaw.slice(0, TARGET_COUNT).map(s => s.url);

    // 2. Iterate Modes
    for (const mode of MODES) {
        console.log(`\n=== MODE: ${mode.toUpperCase()} ===`);

        for (let epoch = 1; epoch <= EPOCHS; epoch++) {
            console.log(`  -- Epoch ${epoch} --`);

            const launchArgs = [
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ];

            if (mode !== 'vanilla') {
                launchArgs.push(`--disable-extensions-except=${EXTENSION_PATH}`);
                launchArgs.push(`--load-extension=${EXTENSION_PATH}`);
            }

            let browser;
            try {
                browser = await puppeteer.launch({
                    headless: false,
                    args: launchArgs
                });
            } catch (e) { console.error("Browser launch failed", e); continue; }

            // 3. Iterate Sites
            for (const url of urls) {
                // CHECK IF DONE
                if (completed.has(`${mode}|${epoch}|${url}`)) {
                    // console.log(`     Skipping ${url} (Already done)`); 
                    continue;
                }

                const persistentPersona = crypto.createHash('sha256').update(url + mode).digest('hex').substring(0, 12);
                let page;

                try {
                    page = await browser.newPage();

                    const visitedFrames = new Set();
                    const seenErrors = new Set(); // Gap C: Deduplication
                    let errorCount = 0;
                    const PROBE_SRC = fs.readFileSync(RESEARCH_PROBE_PATH, 'utf8');

                    // --- Robust Error Logger ---
                    const logError = (type, err, source) => {
                        if (errorCount >= 50) return; // Cap at 50 errors per site visit
                        const sig = `${type}|${err?.message || String(err)}`;
                        if (seenErrors.has(sig)) return; // Dedup
                        seenErrors.add(sig);
                        errorCount++;

                        appendJSONL({
                            event_type: 'error',
                            message: err?.message || String(err),
                            mode, epoch, url,
                            source: source,
                            ts: new Date().toISOString(),
                            run_id: RUN_ID
                        });
                    };

                    page.on('pageerror', err => logError('error', err, 'page_error'));
                    page.on('error', err => logError('error', err, 'crash'));
                    page.on('requestfailed', req => {
                        if (req.failure() && req.failure().errorText === 'net::ERR_BLOCKED_BY_CLIENT') {
                            logError('csp_violation', { message: req.url() }, 'csp'); // Reuse logError for capping
                        }
                    });

                    // Inject Config
                    if (mode !== 'vanilla') {
                        const config = {
                            run_id: RUN_ID,
                            mode: mode,
                            epoch_id: epoch,
                            persona_id: persistentPersona,
                            top_level_site: new URL(url).hostname
                        };
                        await page.evaluateOnNewDocument((c) => {
                            window.__PAL_CONFIG = c;
                        }, config);
                    }

                    // Log Collection
                    page.on('console', msg => {
                        const txt = msg.text();
                        if (txt.startsWith('__PAL_TELEM__:')) {
                            try {
                                const events = JSON.parse(txt.replace('__PAL_TELEM__:', ''));
                                events.forEach(e => {
                                    e.mode = mode;
                                    e.epoch = epoch;
                                    e.url = url;
                                    e.run_id = RUN_ID;
                                    if (!e.ts) e.ts = new Date().toISOString();
                                    appendJSONL(e);
                                });
                            } catch (err) {
                                logError('error', { message: `Telemetry parse: ${err.message}` }, 'crawler_json_parse');
                            }
                        }
                    });

                    console.log(`     Visiting ${url}...`);
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

                    // Gap A: Iframe Injection
                    await new Promise(r => setTimeout(r, 2000));

                    for (const frame of page.frames()) {
                        try {
                            if (!frame.isDetached()) {
                                await frame.evaluate(PROBE_SRC).catch(() => { });
                            }
                        } catch (e) { }
                    }

                    // Wait for results
                    await new Promise(r => setTimeout(r, 2000));

                    await new Promise(r => setTimeout(r, 2000));

                } catch (e) {
                    console.error(`     Error: ${e.message}`);
                    appendJSONL({
                        event_type: 'error',
                        message: e.message,
                        mode, epoch, url,
                        source: 'nav_failure',
                        ts: new Date().toISOString(),
                        run_id: RUN_ID
                    });
                } finally {
                    if (page && !page.isClosed()) await page.close().catch(() => { });
                }
            }
            if (browser) await browser.close();
        }
    }

    console.log("Resume Complete.");
    stream.end();
})();
