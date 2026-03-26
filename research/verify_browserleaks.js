const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const EXTENSION_PATH = path.resolve(__dirname, '../');

(async () => {
    console.log("Starting Browserleaks Verification...");
    const browser = await puppeteer.launch({
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`
        ]
    });

    const url = 'https://browserleaks.com/canvas';

    // Visit 1
    const page1 = await browser.newPage();
    const persona1 = crypto.randomUUID().substring(0, 12);
    await page1.evaluateOnNewDocument((c) => { window.__PAL_CONFIG = c; }, {
        run_id: 'debug-bl', mode: 'privacy', epoch_id: 1, persona_id: persona1, top_level_site: 'browserleaks.com'
    });
    await page1.goto(url, { waitUntil: 'networkidle2' });
    console.log("Visit 1 Complete. Check Screenshot.");
    await page1.screenshot({ path: 'research/bl_visit_1.png' });

    // Visit 2 (Same Persona, Different Epoch -> SHOULD ROTATE in Privacy Mode?)
    // Wait, Privacy Mode rotates per SESSION (Epoch).
    // If I keep persona_id same but change epoch_id, does prehook rotate?
    // prehook logic: `const seed = await generateSeed(config.mode, config.persona_id, config.epoch_id);`
    // Yes, it uses epoch_id.

    const page2 = await browser.newPage();
    await page2.evaluateOnNewDocument((c) => { window.__PAL_CONFIG = c; }, {
        run_id: 'debug-bl', mode: 'privacy', epoch_id: 2, persona_id: persona1, top_level_site: 'browserleaks.com'
    });
    await page2.goto(url, { waitUntil: 'networkidle2' });
    console.log("Visit 2 Complete. Check Screenshot.");
    await page2.screenshot({ path: 'research/bl_visit_2.png' });

    await browser.close();
    console.log("Done. Compare bl_visit_1.png and bl_visit_2.png");
})();
