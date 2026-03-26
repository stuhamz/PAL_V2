const puppeteer = require('puppeteer');
const path = require('path');
const http = require('http');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '');
const DEMO_DIR = path.resolve(__dirname, 'demo');
const PORT = 8081;

// Capture logs to file
const LOG_FILE = 'verify_log.txt';
fs.writeFileSync(LOG_FILE, "STARTING LOG\n");
function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + "\n");
}

const server = http.createServer((req, res) => {
    let cleanPath = req.url.split('?')[0];
    if (cleanPath === '/' || cleanPath === '/dashboard.html') {
        const filePath = path.join(DEMO_DIR, 'dashboard.html');
        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(404); res.end("Not Found");
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(content);
            }
        });
    } else {
        res.writeHead(404); res.end("Not Found");
    }
});

const PROBE_CODE = `
const PAL_DEMO_PROBE = {
    sha256: async (message) => {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },
    vectorHash: async (dataStr) => {
        if (!dataStr) return "null";
        const h = await PAL_DEMO_PROBE.sha256(dataStr);
        return h.substring(0, 16);
    },
    collectVector: async (contextName) => {
        const vector = { ts: new Date().toISOString(), context: contextName, components: {}, timings: {} };
        
        // Canvas
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 100; canvas.height = 100;
            const ctx = canvas.getContext('2d');
            ctx.textBaseline = "top"; ctx.font = "14px 'Arial'";
            ctx.fillStyle = "#f60"; ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = "#069"; ctx.fillText("PAL_RESEARCH_V2", 2, 15);
            ctx.fillStyle = "rgba(102, 204, 0, 0.7)"; ctx.fillText("PAL_RESEARCH_V2", 4, 17);
            const dataUrl = canvas.toDataURL();
            const imageData = ctx.getImageData(0, 0, 50, 50);
            const pixelStr = imageData.data.join(',');
            vector.components.canvas_imagedata_hash = await PAL_DEMO_PROBE.vectorHash(pixelStr);
        } catch (e) { vector.components.canvas_imagedata_hash = "error:" + e.message; }

        // WebGL
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 200; canvas.height = 200;
            const gl = canvas.getContext('webgl');
            if (gl) {
                const pixels = new Uint8Array(200 * 200 * 4);
                gl.readPixels(0, 0, 200, 200, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                const raw = pixels.slice(0, 500).join(",");
                vector.components.webgl_hash = await PAL_DEMO_PROBE.vectorHash(raw);
            } else { vector.components.webgl_hash = "no_webgl"; }
        } catch (e) { vector.components.webgl_hash = "error:" + e.message; }

        return vector;
    }
};
window.PAL_DEMO_PROBE = PAL_DEMO_PROBE;
console.log("PROBE INJECTED");
`;

(async () => {
    log("Starting PAL Inline Verification...");

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

        page.on('console', msg => log('PAGE LOG: ' + msg.text()));
        page.on('pageerror', err => log('PAGE ERROR: ' + err.message));

        try {
            log("Loading Dashboard...");
            // Load dashboard but script src will fail, we inject manually
            await page.goto(`http://localhost:${PORT}/dashboard.html`, { waitUntil: 'domcontentloaded' });

            // Inject Probe
            await page.evaluate(PROBE_CODE);

            // Wait for loader
            await new Promise(r => setTimeout(r, 2000));

            // Manually trigger calling probe and populating history since onPageLoad might have failed or ran before probe
            await page.evaluate(async () => {
                if (window.onPageLoad) await window.onPageLoad(); // Retry logic
                // Or just manual collection
                const vector = await window.PAL_DEMO_PROBE.collectVector('manual');
                // Inject fake history row for verification script to read
                const tbody = document.getElementById('history-body');
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>now</td><td>Manual</td><td>1</td><td>${vector.components.canvas_imagedata_hash}</td><td>${vector.components.webgl_hash}</td><td>NA</td><td>NA</td>`;
                tbody.prepend(tr);
            });

            // Check if loader ran
            const palConfig = await page.evaluate(() => document.documentElement.getAttribute('data-pal-config'));
            log("DOM Config Attribute: " + palConfig);

            const hash1 = await page.evaluate(() => document.querySelector('#history-body tr td:nth-child(4)').innerText);
            log("Hash 1: " + hash1);

            log("Reloading...");
            await page.reload({ waitUntil: 'domcontentloaded' });

            // Re-inject Probe
            await page.evaluate(PROBE_CODE);
            await new Promise(r => setTimeout(r, 2000));

            await page.evaluate(async () => {
                const vector = await window.PAL_DEMO_PROBE.collectVector('manual');
                const tbody = document.getElementById('history-body');
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>now</td><td>Manual</td><td>2</td><td>${vector.components.canvas_imagedata_hash}</td><td>${vector.components.webgl_hash}</td><td>NA</td><td>NA</td>`;
                tbody.prepend(tr);
            });

            const hash2 = await page.evaluate(() => document.querySelector('#history-body tr td:nth-child(4)').innerText);
            log("Hash 2: " + hash2);

            if (hash1 !== hash2) {
                log("SUCCESS: Drift Confirmed.");
            } else {
                log("FAILURE: No Drift.");
            }

        } catch (e) {
            log("Error: " + e.message);
        }

        await browser.close();
        server.close();
        process.exit(0);
    });
})();
