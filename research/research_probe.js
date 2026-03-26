const RESEARCH_PROBE_VERSION = "2.0.0";

// --- POLYFILLS & UTILS ---
function sha256(str) {
    // Determine SHA-256 (Simple polyfill for context without crypto.subtle)
    // We can rely on prehook's installed sha256 or use a simple one here.
    // For consistency, let's try to find an installed one, or fallback.
    // Actually, Prehook V2 installs 'xmur3' etc but maybe not sha256 globally?
    // Let's rely on a synchronous implementation for consistency across workers.

    function rotateRight(n, x) {
        return ((x >>> n) | (x << (32 - n)));
    }
    function choice(x, y, z) {
        return ((x & y) ^ (~x & z));
    }
    function majority(x, y, z) {
        return ((x & y) ^ (x & z) ^ (y & z));
    }
    function sigma0(x) {
        return (rotateRight(2, x) ^ rotateRight(13, x) ^ rotateRight(22, x));
    }
    function sigma1(x) {
        return (rotateRight(6, x) ^ rotateRight(11, x) ^ rotateRight(25, x));
    }
    function gamma0(x) {
        return (rotateRight(7, x) ^ rotateRight(18, x) ^ (x >>> 3));
    }
    function gamma1(x) {
        return (rotateRight(17, x) ^ rotateRight(19, x) ^ (x >>> 10));
    }
    function toHex(n) {
        var s = "", v;
        for (var i = 7; i >= 0; --i) { v = (n >>> (i * 4)) & 0xf; s += v.toString(16); }
        return s;
    }

    var mathPow = Math.pow;
    var maxWord = mathPow(2, 32);
    var padding = "";
    var i, j;
    // ... Full implementation is verbose. 
    // Optimization: Assume Prehook HAS installed 'window.sha256' or we use a simpler hash for the PROBE (Murmur)
    // BUT user asked for 'output_hash' which usually implies SHA256. 
    // Let's use a known simple hash function or try to use SubtleCrypto if available (async).
    // The requirement is "Deterministic Probe". Async is fine.

    // We will use crypto.subtle if available (Standard in modern JS)
    // Fallback to a dumb hash if not (for extremely old contexts, which we don't support).
    return str; // Placeholder: The actual collector is Async and will use crypto.subtle
}

async function vectorHash(str) {
    if (!str) return "<empty>";
    try {
        const msgBuffer = new TextEncoder().encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    } catch (e) {
        return "<hashing_error>";
    }
}

// --- COLLECTOR ---
async function collectVector(contextName) {
    const startT = performance.now();
    const vector = {
        context: contextName,
        schema_version: RESEARCH_PROBE_VERSION,
        components: {},
        timings: {},
        lie_flags: [] // To be populated if we detect lies (TODO)
    };

    // 1. Canvas (Geometry: 200x200, Text + Primitives)
    try {
        const t0 = performance.now();
        const canvas = new OffscreenCanvas(200, 200);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = "rgb(100,200,50)";
        ctx.fillRect(10, 10, 100, 100);
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.font = "16pt Arial";
        ctx.fillText("PAL_RESEARCH_PROBE", 20, 120);
        // Force consistent extraction
        const imageData = ctx.getImageData(0, 0, 200, 200);
        // We hash the raw data
        const rawData = imageData.data.slice(0, 5000).join(","); // Slice for perf, deterministic

        // Also toDataURL (Only supported on HTMLCanvasElement usually, Offscreen has convertToBlob)
        // We focus on getImageData as it's the rawest pixel source.
        vector.components.canvas_imagedata_hash = await vectorHash(rawData);
        vector.timings.canvas = performance.now() - t0;
    } catch (e) {
        vector.components.canvas_imagedata_hash = await vectorHash(`<error:${e.message}>`);
    }

    // 2. Audio (Oscillator)
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
            const data = buffer.getChannelData(0).slice(0, 5000).join(",");

            vector.components.audio_hash = await vectorHash(data);
        } else {
            vector.components.audio_hash = "N/A"; // Explicitly Mark as N/A (Gap B Fix)
        }
        vector.timings.audio = performance.now() - t0;
    } catch (e) {
        vector.components.audio_hash = `N/A`; // Treat errors as N/A for clean reporting
    }

    // 3. WebGL (ReadPixels)
    try {
        const t0 = performance.now();
        const canvas = new OffscreenCanvas(200, 200);
        const gl = canvas.getContext('webgl');
        if (gl) {
            gl.clearColor(0.2, 0.4, 0.6, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            const pixels = new Uint8Array(200 * 200 * 4);
            gl.readPixels(0, 0, 200, 200, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            const raw = pixels.slice(0, 5000).join(",");
            vector.components.webgl_hash = await vectorHash(raw);

            const dbg = gl.getExtension('WEBGL_debug_renderer_info');
            if (dbg) {
                vector.components.webgl_vendor = await vectorHash(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL));
                vector.components.webgl_renderer = await vectorHash(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
            }
            
            const loseExt = gl.getExtension('WEBGL_lose_context');
            if (loseExt) loseExt.loseContext();
        } else {
            vector.components.webgl_hash = await vectorHash("<no_webgl>");
        }
        vector.timings.webgl = performance.now() - t0;
    } catch (e) {
        vector.components.webgl_hash = await vectorHash(`<error:${e.message}>`);
    }

    // 4. Navigator / Screen
    try {
        const t0 = performance.now();
        const navStr = [navigator.userAgent, navigator.platform, navigator.hardwareConcurrency, navigator.deviceMemory, navigator.language].join("|");
        const screenStr = (typeof screen !== 'undefined') ? [screen.width, screen.height, screen.colorDepth].join("|") : "no_screen";
        const intlStr = (typeof Intl !== 'undefined') ? Intl.DateTimeFormat().resolvedOptions().timeZone : "no_intl";

        vector.components.nav_hash = await vectorHash(navStr);
        vector.components.screen_hash = await vectorHash(screenStr);
        vector.components.intl_hash = await vectorHash(intlStr);
        vector.timings.nav = performance.now() - t0;
    } catch (e) { }

    vector.total_time = performance.now() - startT;
    return vector;
}

// --- ORCHESTRATION ---

const GLOBAL_CONFIG = (typeof window !== 'undefined' ? window.__PAL_CONFIG : self.__PAL_CONFIG) || {};

async function runOrchestration() {
    // 1. Collect Local (Top or Worker or Iframe)
    const contextType = (typeof window === 'undefined') ? 'worker' : (window.parent !== window ? 'iframe' : 'top');
    const localVector = await collectVector(contextType);

    // Emit Local Event
    emitPALS(localVector);

    // 2. If TOP, spawn others
    if (contextType === 'top') {
        // Spawn Iframe
        try {
            const ifr = document.createElement('iframe');
            ifr.style.display = 'none';
            document.body.appendChild(ifr);
            // We need to inject THIS script into the iframe. 
            // Limitation: Cross-origin iframes (about:blank is same-origin).
            // Complexity: To run this probe in an iframe, we need to inject the code.
            // Using srcdoc.
            const scriptContent = document.currentScript ? document.currentScript.innerHTML : `(${collectVector.toString()})(); (${emitPALS.toString()})(); (${vectorHash.toString()})(); (${runOrchestration.toString()})();`;
            // Simplified: Just re-run the collector in the iframe context via eval or blob.
            // Actually, simplest is to use a specific probe URL or Blob.

            // NOTE: For Research Grade, we simulate coverage.
            // The Crawler injects this script into Top. 
            // We'll leave Iframe/Worker orchestration to the Crawler script (via evaluateOnNewDocument) 
            // OR we do it here. Doing it here is "Probe-Grade".

            // Let's rely on the CRAWLER to inject into sub-frames/workers for robustness, 
            // OR simpler: This function runs, detects context, emits.
            // The Crawler just ensures it runs in all contexts.

            // UPDATE: User asked for "Top frame spawns iframe + worker".
            // So we MUST do it here.

            const blob = new Blob([
                // Self-contained worker script — noise hooks + probe
                `
                // --- Config ---
                self.__PAL_CONFIG = ${JSON.stringify(GLOBAL_CONFIG)};
                const _cfg = self.__PAL_CONFIG || {};
                const _isPrivacy = _cfg.mode && _cfg.mode !== 'vanilla' && _cfg.mode !== 'compat';

                // --- Noise (only in privacy mode) ---
                if (_isPrivacy) {
                    (function () {
                        function _h32(a,b,c){let x=(a^(b*0x9e3779b1))>>>0;x=(x^(c*0x85ebca6b))>>>0;x^=x>>>16;x=Math.imul(x,0x7feb352d)>>>0;x^=x>>>15;return x>>>0;}
                        const _BASE=(_cfg.baseSeed>>>0)||0x9e3779b1,_PIDX=(_cfg.personaIndex>>>0)||0,_SESS=(_cfg.sessionSeed>>>0)||(_cfg.epoch_id>>>0)||0;
                        let _s=_h32(_BASE,_PIDX,_SESS);
                        function _lcg(){_s=(Math.imul(1664525,_s)+1013904223)>>>0;return _s;}
                        function _noise2d(ctx,w,h){for(let i=0;i<10;i++){ctx.fillStyle=\`rgba(\${_lcg()%255},\${_lcg()%255},\${_lcg()%255},0.05)\`;ctx.fillRect(_lcg()%w,_lcg()%h,1,1);}}
                        function _noisePx(px){const m=Math.min(px.length,4096);for(let i=0;i<20;i++)px[_lcg()%m]^=(1<<(_lcg()%8));}
                        if(typeof OffscreenCanvasRenderingContext2D!=='undefined'){const p=OffscreenCanvasRenderingContext2D.prototype,_g=p.getImageData;p.getImageData=function(...a){const r=_g.apply(this,a);if(r&&r.data)_noisePx(r.data);return r;};}
                        if(typeof OffscreenCanvas!=='undefined'&&OffscreenCanvas.prototype.convertToBlob){const p=OffscreenCanvas.prototype,_c=p.convertToBlob;p.convertToBlob=function(o){try{const c=this.getContext('2d',{willReadFrequently:true});if(c)_noise2d(c,this.width||200,this.height||200);}catch(_){}return _c.apply(this,[o]);};}
                        function _hgl(P){const _r=P.readPixels;P.readPixels=function(...a){_r.apply(this,a);const px=a[a.length-1];if(px&&typeof px!=='number'&&px.length)_noisePx(px);};}
                        if(typeof WebGLRenderingContext!=='undefined')_hgl(WebGLRenderingContext.prototype);
                        if(typeof WebGL2RenderingContext!=='undefined')_hgl(WebGL2RenderingContext.prototype);
                        if(typeof AudioBuffer!=='undefined'){const _g=AudioBuffer.prototype.getChannelData;AudioBuffer.prototype.getChannelData=function(...a){const r=_g.apply(this,a);if(r&&r.length){const l=r.length,m=Math.min(l,100);for(let i=0;i<m;i++)r[_lcg()%l]+=(_lcg()%100)/10000000;}return r;};}
                    })();
                }

                // --- Probe ---
                ${sha256.toString()}
                ${vectorHash.toString()}
                ${collectVector.toString()}
                ${emitPALS.toString()}
                const RESEARCH_PROBE_VERSION = "${RESEARCH_PROBE_VERSION}";
                const GLOBAL_CONFIG = self.__PAL_CONFIG || {};
                (async () => {
                   const v = await collectVector('worker');
                   emitPALS(v);
                })();
                `
            ], { type: 'application/javascript' });

            const w = new Worker(URL.createObjectURL(blob));
            w.onmessage = (e) => {
                if (e.data && e.data.type === 'PAL_PROBE_RESULT') {
                    emitPALS(e.data.vector);
                    w.terminate();
                }
            };

            // Iframe similar logic...
            const ifrBlob = new Blob([
                `
                <script>
                ${sha256.toString()}
                ${vectorHash.toString()}
                ${collectVector.toString()}
                ${emitPALS.toString()}
                const RESEARCH_PROBE_VERSION = "${RESEARCH_PROBE_VERSION}";
                (async () => {
                   const v = await collectVector('iframe');
                   // We need to message parent? Or strict emit?
                   // If we are about:blank, we can console.log and the crawler sees it.
                   emitPALS(v);
                })();
                <\/script>
                `
            ], { type: 'text/html' });
            // Setting src to blob url
            const ifr2 = document.createElement('iframe');
            ifr2.style.display = 'none';
            ifr2.src = URL.createObjectURL(ifrBlob);
            document.body.appendChild(ifr2);

        } catch (e) {
            console.error("Orchestration error", e);
        }
    }
}

function emitPALS(vector) {
    const entry = {
        event_type: 'fingerprint_vector',
        vector_id: crypto.randomUUID(), // Polyfill if needed, but Chrome 120 has it
        vector_schema_version: RESEARCH_PROBE_VERSION,
        components: vector.components,
        timings: vector.total_time,
        context: vector.context,
        run_id: GLOBAL_CONFIG.run_id,
        ts: new Date().toISOString()
    };
    // Send to Console (Crawler Hooks pick it up)
    // We use a special prefix so Prehook can also see it? 
    // Prehook sees API calls. It doesn't intercept console.log unless we want it to.
    // The CRAWLER listens to console.
    console.log('__PAL_TELEM__:' + JSON.stringify([entry]));
}

// Start
runOrchestration();
