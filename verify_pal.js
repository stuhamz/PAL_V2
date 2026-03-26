const puppeteer = require('puppeteer');
const path = require('path');
const http = require('http');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '');
const DEMO_DIR = path.resolve(__dirname, 'demo');
const PORT = 8081;

const server = http.createServer((req, res) => {
    console.log(`SERVER: ${req.method} ${req.url}`);

    // Remove query string and leading slash
    let cleanPath = req.url.split('?')[0];
    if (cleanPath === '/') cleanPath = '/dashboard.html';
    cleanPath = cleanPath.replace(/^[\\\/]+/, ''); // Remove leading slash/backslash

    const filePath = path.join(DEMO_DIR, cleanPath);
    console.log(`SERVER: Serving ${filePath}`);

    fs.readFile(filePath, (err, content) => {
        if (err) {
            console.log(`SERVER: 404 ${filePath}`, err.message);
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
    console.log("Starting PAL Verification (Fixed Server)...");

    server.listen(PORT, async () => {
        const browser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                `--disable-extensions-except=${EXTENSION_PATH}`,
                `--load-extension=${EXTENSION_PATH}`
            ]
        });

        const page = await browser.newPage();

        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
        page.on('requestfailed', req => console.log('REQ FAILED:', req.url(), req.failure().errorText));

        try {
            console.log("Loading Dashboard...");
            await page.goto(`http://localhost:${PORT}/dashboard.html`, { waitUntil: 'networkidle0' });

            await new Promise(r => setTimeout(r, 2000));

            // Check if loader ran
            const palConfig = await page.evaluate(() => document.documentElement.getAttribute('data-pal-config'));
            console.log("DOM Config Attribute:", palConfig);

            if (!palConfig) {
                console.error("CRITICAL: Loader did not inject config!");
            }

            // Get Hash 1
            const hash1 = await page.evaluate(() => {
                const cell = document.querySelector('#history-body tr td:nth-child(4)');
                return cell ? cell.innerText : "N/A";
            });
            console.log("Hash 1:", hash1);

            console.log("Reloading...");
            await page.reload({ waitUntil: 'networkidle0' });
            await new Promise(r => setTimeout(r, 2000));

            const hash2 = await page.evaluate(() => {
                const cell = document.querySelector('#history-body tr td:nth-child(4)');
                return cell ? cell.innerText : "N/A";
            });
            console.log("Hash 2:", hash2);

            if (hash1 !== hash2 && hash1 !== "N/A") {
                console.log("SUCCESS: Drift Confirmed.");
                console.log(`Drift: ${hash1} -> ${hash2}`);
            } else {
                console.log("FAILURE: No Drift.");
                console.log(`Hashes: ${hash1} vs ${hash2}`);
            }

        } catch (e) {
            console.error("Error:", e);
        }

        await new Promise(r => setTimeout(r, 500));
        await browser.close();
        server.close();
        process.exit(0);
    });
})();
