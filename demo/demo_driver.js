const puppeteer = require('puppeteer');
const path = require('path');
const http = require('http');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '../');
const DEMO_DIR = path.resolve(__dirname, '');
const PORT = 8080;

// --- Simple Static Server ---
const server = http.createServer((req, res) => {
    // Basic path sanitization
    const safeSuffix = path.normalize(req.url).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(DEMO_DIR, safeSuffix === '/' ? 'dashboard.html' : safeSuffix);

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end("Not Found");
        } else {
            let contentType = 'text/html';
            if (req.url.endsWith('.js')) contentType = 'application/javascript';
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

(async () => {
    console.log("Starting PAL Interactive Demo...");

    server.listen(PORT, async () => {
        console.log(`Server running at http://localhost:${PORT}`);
        console.log("Extension Path:", EXTENSION_PATH);

        const browser = await puppeteer.launch({
            headless: false,
            defaultViewport: null,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                `--disable-extensions-except=${EXTENSION_PATH}`,
                `--load-extension=${EXTENSION_PATH}`,
                '--start-maximized'
            ]
        });

        const page = await browser.newPage();

        // --- Command Handler ---
        page.on('console', async msg => {
            const txt = msg.text();
            if (txt.startsWith('__PAL_CMD__:SET_CONFIG:')) {
                const parts = txt.split(':');
                const mode = parts[2];
                const epoch = parseInt(parts[3], 10);

                console.log(`[Demo Driver] Received Config Request: Mode=${mode}, Epoch=${epoch}`);

                // Inject Config for NEXT load
                const config = {
                    run_id: 'demo-interactive',
                    mode: mode,
                    epoch_id: epoch,
                    persona_id: 'demo-user-stable',
                    top_level_site: 'localhost'
                };

                await page.evaluateOnNewDocument((c) => {
                    window.__PAL_CONFIG = c;
                }, config);

                console.log("[Demo Driver] Config Injected. Reloading...");
                await page.reload({ waitUntil: 'networkidle2' });
            }
        });

        console.log("Loading Dashboard...");
        await page.goto(`http://localhost:${PORT}/dashboard.html`, { waitUntil: 'networkidle2' });

        console.log("Demo Ready. Interact with the browser window.");
    });
})();
