const puppeteer = require('puppeteer');
const path = require('path');
const http = require('http');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '../');
const DEMO_DIR = path.resolve(__dirname, '../demo');
const PORT = 8082; // Use a different port to avoid conflicts

// --- Simple Static Server ---
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
        const vector = { components: {} };
        // Canvas Image Data
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 100; canvas.height = 100;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.textBaseline = "top"; ctx.font = "14px 'Arial'";
            ctx.fillStyle = "#f60"; ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = "#069"; ctx.fillText("PAL_RESEARCH_V2", 2, 15);
            ctx.fillStyle = "rgba(102, 204, 0, 0.7)"; ctx.fillText("PAL_RESEARCH_V2", 4, 17);
            const imageData = ctx.getImageData(0, 0, 50, 50);
            const pixelStr = imageData.data.join(',');
            vector.components.canvas_imagedata_hash = await PAL_DEMO_PROBE.vectorHash(pixelStr);
        } catch (e) { vector.components.canvas_imagedata_hash = "error:" + e.message; }
        return vector;
    }
};
window.PAL_DEMO_PROBE = PAL_DEMO_PROBE;
`;

async function runTest(mode, withExtension) {
    console.log(`\n--- Running ${mode} Test ---`);
    
    const launchArgs = ['--no-sandbox', '--disable-setuid-sandbox'];
    if (withExtension) {
        launchArgs.push(`--disable-extensions-except=${EXTENSION_PATH}`);
        launchArgs.push(`--load-extension=${EXTENSION_PATH}`);
    }

    const browser = await puppeteer.launch({
        headless: "new",
        args: launchArgs
    });

    const page = await browser.newPage();
    
    try {
        // Visit 1
        await page.goto(`http://localhost:${PORT}/dashboard.html`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(PROBE_CODE);
        await new Promise(r => setTimeout(r, 1000)); // wait for extension to apply if any
        
        let hash1 = await page.evaluate(async () => {
            const vector = await window.PAL_DEMO_PROBE.collectVector('manual');
            return vector.components.canvas_imagedata_hash;
        });

        // Visit 2
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.evaluate(PROBE_CODE);
        await new Promise(r => setTimeout(r, 1000)); // wait for extension to apply if any
        
        let hash2 = await page.evaluate(async () => {
            const vector = await window.PAL_DEMO_PROBE.collectVector('manual');
            return vector.components.canvas_imagedata_hash;
        });

        console.log(`Visit 1 Hash: ${hash1}`);
        console.log(`Visit 2 Hash: ${hash2}`);

        if (withExtension) {
             if (hash1 !== hash2) {
                 console.log(`✅ SUCCESS: ${mode} has DRIFT (Hashes are different)`);
             } else {
                 console.log(`❌ FAILED: ${mode} has NO DRIFT (Hashes are identical)`);
             }
        } else {
             if (hash1 === hash2) {
                 console.log(`✅ SUCCESS: ${mode} has NO DRIFT (Hashes are identical)`);
             } else {
                 console.log(`❌ FAILED: ${mode} has UNEXPECTED DRIFT (Hashes are different)`);
             }
        }

    } catch(e) {
        console.error(`${mode} Test Error:`, e.message);
    } finally {
        await browser.close();
    }
}

(async () => {
    server.listen(PORT, async () => {
        console.log("Starting Side-by-Side Comparison...\n");
        
        await runTest("Vanilla Mode (Extension OFF)", false);
        await runTest("PAL Mode (Extension ON)", true);

        console.log("\nDone.");
        server.close();
        process.exit(0);
    });
})();
