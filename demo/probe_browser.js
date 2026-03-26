// Adapted from research/research_probe.js for Browser Demo
// All logic encapsulated in global `PAL_DEMO_PROBE`

const PAL_DEMO_PROBE = {
    // --- Hashing ---
    sha256: async (message) => {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    },

    vectorHash: async (dataStr) => {
        if (!dataStr) return "null";
        const h = await PAL_DEMO_PROBE.sha256(dataStr);
        return h.substring(0, 16);
    },

    collectVector: async (contextName) => {
        const vector = {
            ts: new Date().toISOString(),
            context: contextName,
            components: {},
            timings: {}
        };

        const startT = performance.now();

        // 1. Canvas
        try {
            const t0 = performance.now();
            const canvas = document.createElement('canvas');
            canvas.width = 100; canvas.height = 100;
            const ctx = canvas.getContext('2d');
            ctx.textBaseline = "top";
            ctx.font = "14px 'Arial'";
            ctx.textBaseline = "alphabetic";
            ctx.fillStyle = "#f60";
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = "#069";
            ctx.fillText("PAL_RESEARCH_V2", 2, 15);
            ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
            ctx.fillText("PAL_RESEARCH_V2", 4, 17);

            const dataUrl = canvas.toDataURL();
            const imageData = ctx.getImageData(0, 0, 50, 50); // Small sample
            // Hash the raw bytes of ImageData
            const pixelData = imageData.data;
            let pixelStr = "";
            for (let i = 0; i < pixelData.length; i += 4) {
                pixelStr += pixelData[i] + "," + pixelData[i + 1] + "," + pixelData[i + 2] + "," + pixelData[i + 3] + "|";
            }

            vector.components.canvas_toDataURL_hash = await PAL_DEMO_PROBE.vectorHash(dataUrl);
            vector.components.canvas_imagedata_hash = await PAL_DEMO_PROBE.vectorHash(pixelStr);
            vector.timings.canvas = performance.now() - t0;
        } catch (e) {
            vector.components.canvas_imagedata_hash = `error:${e.message}`;
        }

        // 2. Audio
        try {
            const t0 = performance.now();
            if (typeof OfflineAudioContext !== 'undefined' || typeof webkitOfflineAudioContext !== 'undefined') {
                const AudioCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
                const ctx = new AudioCtx(1, 44100, 44100);
                const osc = ctx.createOscillator();
                osc.type = "triangle";
                osc.frequency.setValueAtTime(1000, 0);
                const comp = ctx.createDynamicsCompressor();
                osc.connect(comp);
                comp.connect(ctx.destination);
                osc.start(0);

                const renderPromise = ctx.startRendering();
                const buffer = await renderPromise;
                const data = buffer.getChannelData(0).slice(0, 1000).join(",");
                vector.components.audio_hash = await PAL_DEMO_PROBE.vectorHash(data);
            } else {
                vector.components.audio_hash = "N/A";
            }
            vector.timings.audio = performance.now() - t0;
        } catch (e) {
            vector.components.audio_hash = "N/A";
        }

        // 3. WebGL
        try {
            const t0 = performance.now();
            const canvas = document.createElement('canvas'); // On-screen for demo? No, offscreen fine.
            canvas.width = 200; canvas.height = 200;
            const gl = canvas.getContext('webgl');
            if (gl) {
                gl.clearColor(0.2, 0.4, 0.6, 1.0);
                gl.clear(gl.COLOR_BUFFER_BIT);
                const pixels = new Uint8Array(200 * 200 * 4);
                gl.readPixels(0, 0, 200, 200, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                const raw = pixels.slice(0, 500).join(",");
                vector.components.webgl_hash = await PAL_DEMO_PROBE.vectorHash(raw);
            } else {
                vector.components.webgl_hash = "no_webgl";
            }
            vector.timings.webgl = performance.now() - t0;
        } catch (e) {
            vector.components.webgl_hash = `error:${e.message}`;
        }

        // 4. Navigator
        try {
            const navStr = [navigator.userAgent, navigator.platform, navigator.hardwareConcurrency, navigator.deviceMemory, navigator.language].join("|");
            vector.components.nav_hash = await PAL_DEMO_PROBE.vectorHash(navStr);
        } catch (e) { }

        return vector;
    }
};
