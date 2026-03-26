const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// --- Paths ---
const SITES_FILE = path.join(__dirname, 'sites_structured.json');
const EXTENSION_PATH = path.resolve(__dirname, '../');
const RESEARCH_PROBE_PATH = path.join(__dirname, 'research_probe.js');
const WORKER_NOISE_PATH = path.join(__dirname, 'worker_noise.js');
const DATA_DIR = path.resolve(__dirname, '../data/runs');

// --- GATE 4 CONFIGURATION ---
const TARGET_COUNT = 50; // Gate 4: Full pilot (50 sites)
const EPOCHS = 3;
const MODES = ['vanilla', 'compat', 'privacy'];
const RUN_ID = crypto.randomUUID();

const RUN_DIR = path.join(DATA_DIR, RUN_ID);
if (!fs.existsSync(RUN_DIR)) fs.mkdirSync(RUN_DIR, { recursive: true });
const EVENTS_FILE = path.join(RUN_DIR, `run_${RUN_ID}.jsonl`);

fs.writeFileSync(path.join(DATA_DIR, 'latest_run.txt'), RUN_ID);

const stream = fs.createWriteStream(EVENTS_FILE, { flags: 'a' });

function appendJSONL(data) {
    if (!stream.write(JSON.stringify(data) + '\n')) {}
}

(async () => {
    console.log(`=========================================`);
    console.log(`🛡️ GATE 4 RESEARCH RUN: ${RUN_ID}`);
    console.log(`=========================================`);

    let urls = [
        // --- Fingerprinting Research Tools ---
        'https://amiunique.org/fingerprint',
        'https://browserleaks.com/canvas',
        'https://browserleaks.com/webgl',
        'https://browserleaks.com/javascript',
        'https://abrahamjuliot.github.io/creepjs/',
        'https://coveryourtracks.eff.org/',
        'https://www.deviceinfo.me/',
        'https://fingerprintjs.github.io/fingerprintjs/',
        'https://niespodd.github.io/browser-fingerprinting/',
        'https://www.whatismybrowser.com/detect/what-is-my-user-agent/',
        // --- Browser Leak Tests ---
        'https://browserleaks.com/fonts',
        'https://browserleaks.com/geo',
        'https://browserleaks.com/css',
        'https://browserleaks.com/features',
        'https://ipleak.net/',
        // --- Privacy / Security Audit ---
        'https://www.doileak.com/',
        'https://www.browserspy.dk/',
        'https://privacy.net/analyzer/',
        'https://www.dnsleaktest.com/',
        'https://www.grc.com/fingerprints.htm',
        // --- Commercial Fingerprinting SDKs (public demos) ---
        'https://fingerprint.com/products/fingerprint-pro/',
        'https://www.threatmetrix.com/',
        'https://www.maxmind.com/en/geoip2-precision-services',
        'https://pixelscan.net/',
        'https://bot.sannysoft.com/',
        // --- Ad-Tech / Tracker Heavy ---
        'https://www.nytimes.com/',
        'https://www.theguardian.com/',
        'https://www.forbes.com/',
        'https://www.huffpost.com/',
        'https://www.cnn.com/',
        // --- E-Commerce (heavy tracking) ---
        'https://www.amazon.com/',
        'https://www.ebay.com/',
        'https://www.etsy.com/',
        'https://www.walmart.com/',
        'https://www.target.com/',
        // --- Social Media ---
        'https://www.reddit.com/',
        'https://twitter.com/',
        'https://www.instagram.com/',
        'https://www.linkedin.com/',
        'https://www.facebook.com/',
        // --- Tech / Dev ---
        'https://github.com/',
        'https://stackoverflow.com/',
        'https://www.google.com/',
        'https://www.bing.com/',
        'https://www.yahoo.com/',
        // --- General News & Content ---
        'https://www.bbc.com/',
        'https://www.reuters.com/',
        'https://www.washingtonpost.com/',
        'https://www.usatoday.com/',
        'https://techcrunch.com/',
    ];
    const PROBE_SRC = fs.readFileSync(RESEARCH_PROBE_PATH, 'utf8');
    const WORKER_NOISE_SRC = fs.readFileSync(WORKER_NOISE_PATH, 'utf8');

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
            } catch (e) {
                console.error("Browser launch failed", e);
                continue;
            }

            for (const url of urls) {
                console.log(`     Visiting ${url}...`);
                const persistentPersona = crypto.createHash('sha256').update(url + mode).digest('hex').substring(0, 12);
                let page;
                
                try {
                    page = await browser.newPage();
                    const seenErrors = new Set();
                    let errorCount = 0;

                    const logError = (type, err, source) => {
                        if (errorCount >= 50) return;
                        const sig = `${type}|${err?.message || String(err)}`;
                        if (seenErrors.has(sig)) return;
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

                    // Inject Config for Extension
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

                    // Listen for telemetry from all contexts (top, iframe, worker)
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

                    // Worker Execution — inject config into self before probe runs
                    page.on('workercreated', async worker => {
                        try {
                            // Capture telemetry emitted via console.log inside workers
                            worker.on('console', msg => {
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
                                    } catch (_) {}
                                }
                            });

                            // Inject the config into the worker's global scope (self)
                            if (mode !== 'vanilla') {
                                const workerConfig = {
                                    run_id: RUN_ID,
                                    mode: mode,
                                    epoch_id: epoch,
                                    persona_id: persistentPersona,
                                    top_level_site: new URL(url).hostname
                                };
                                await Promise.race([
                                    worker.evaluate((c) => { self.__PAL_CONFIG = c; }, workerConfig),
                                    new Promise(r => setTimeout(r, 2000))
                                ]).catch(() => {});
                            }

                            // Inject noise hooks first (privacy mode only), then run the probe
                            if (mode !== 'vanilla') {
                                await Promise.race([
                                    worker.evaluate(WORKER_NOISE_SRC),
                                    new Promise(r => setTimeout(r, 2000))
                                ]).catch(() => {});
                            }

                            // Now run the probe inside the worker
                            await Promise.race([
                                worker.evaluate(PROBE_SRC),
                                new Promise(r => setTimeout(r, 5000))
                            ]).catch(() => {});
                        } catch (e) {}
                    });

                    // We use networkidle2 and 10s timeout so the page actually loads enough geometry.
                    // We swallow the exception to ensure we STILL inject the probe if it hits 10s.
                    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(e => {
                        console.log(`       [Timeout handled] ${e.message}`);
                    });

                    // Wait for main page to settle
                    await new Promise(r => setTimeout(r, 2000));

                    // Evaluate across all frames (Top + IFrames)
                    for (const frame of page.frames()) {
                        try {
                            if (!frame.isDetached()) {
                                // .catch() prevents hangs if the frame context is utterly destroyed
                                await frame.evaluate(PROBE_SRC).catch(() => {});
                            }
                        } catch (e) { }
                    }

                    // Let async probes finish
                    await new Promise(r => setTimeout(r, 2500));

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

    console.log(`\n✅ Gate 1 Crawl Complete! Run ID: ${RUN_ID}`);
    console.log(`To evaluate: node ../tools/research_gate_evaluator.js ${RUN_ID}`);
    stream.end();
})();
