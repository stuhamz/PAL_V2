// src/content/prehook.js
// Injected into MAIN world to hook APIs
(function () {
    console.log("PAL PREHOOK STARTED");
    if (window.__pal_patch_installed__) return;
    window.__pal_patch_installed__ = true;

    // --- Diagnostics ---
    const DIAG = (window.PAL_DIAG = {
        hooks: [],
        calls: {},
        notes: [],
        config: null
    });
    const bump = k => DIAG.calls[k] = (DIAG.calls[k] || 0) + 1;
    const note = (t, v) => DIAG.notes.push({ t, v, ts: Date.now() });

    DIAG.hooks.push("installed");

    // --- State ---
    let PAL_CFG = null;
    let PRNG = null;
    let NOISE_SEED = 0;

    // --- Seeding Logic ---
    function hash32(a, b, c) {
        let x = (a ^ (b * 0x9e3779b1)) >>> 0;
        x = (x ^ (c * 0x85ebca6b)) >>> 0;
        x ^= x >>> 16;
        x = Math.imul(x, 0x7feb352d) >>> 0;
        x ^= x >>> 15;
        return x >>> 0;
    }

    function initConfig(raw) {
        if (!raw) return;
        try {
            const cfg = JSON.parse(raw);
            if (cfg.enabled === false || cfg.mode === 'compat') {
                PAL_CFG = null;
                return;
            }
            PAL_CFG = cfg;
            DIAG.config = cfg;

            const BASE = (PAL_CFG.baseSeed >>> 0) || 0x9e3779b1;
            const PIDX = (PAL_CFG.personaIndex >>> 0) || 0;
            // Use epoch_id to force PRNG drift across epochs during testing
            const SESS = (PAL_CFG.sessionSeed >>> 0) || (PAL_CFG.epoch_id >>> 0) || 0;
            NOISE_SEED = hash32(BASE, PIDX, SESS);

            PRNG = function (initialSeed) {
                let s = initialSeed;
                return function () {
                    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
                    return s;
                };
            }(NOISE_SEED);

            console.log("PAL PREHOOK: Config Initialized", cfg);
            updatePersona(PIDX);
        } catch (e) {
            console.error("PAL PREHOOK: Config Parse Error", e);
        }
    }

    // --- Personas ---
    const PERSONA_MAP = [
        { name: "Std", glVendor: "Google Inc. (Intel)", glRenderer: "ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0)" },
        { name: "High", glVendor: "Intel Inc.", glRenderer: "Intel Iris OpenGL Engine" },
        { name: "Lin", glVendor: "Mesa/X.org", glRenderer: "Mesa Intel(R) UHD Graphics 620" },
        { name: "Mac", glVendor: "Apple", glRenderer: "Apple M1" }
    ];

    let personaVendorString = "";
    let personaRendererString = "";

    function updatePersona(idx) {
        const ActivePersona = PERSONA_MAP[idx % PERSONA_MAP.length];
        personaVendorString = ActivePersona.glVendor;
        personaRendererString = ActivePersona.glRenderer;
    }

    // --- Config Detection ---
    function tryInitialize() {
        let rawStr = document.documentElement ? document.documentElement.getAttribute("data-pal-config") : null;
        let merged = null;
        if (rawStr) {
            try { merged = JSON.parse(rawStr); } catch(e){}
        }
        
        // Always respect window.__PAL_CONFIG if present (Test Harness Priority)
        if (typeof window !== 'undefined' && window.__PAL_CONFIG) {
            merged = Object.assign(merged || {}, window.__PAL_CONFIG);
        }

        if (merged) {
            initConfig(JSON.stringify(merged));
        }
    }

    // 1. Try immediate
    tryInitialize();

    // 2. Observer
    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.type === 'attributes' && m.attributeName === 'data-pal-config') {
                tryInitialize();
            }
        }
    });

    if (document.documentElement) {
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-pal-config'] });
    } else {
        // Wait for documentElement
        const rootObserver = new MutationObserver(() => {
            if (document.documentElement) {
                rootObserver.disconnect();
                tryInitialize();
                observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-pal-config'] });
            }
        });
        rootObserver.observe(document, { childList: true });
    }

    // --- Noise Functions ---
    function applyNoise2D(ctx, w, h) {
        if (!PRNG) return;
        const prev = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = "source-over"; // Ensure visibility

        // Draw 10 random pixels
        for (let i = 0; i < 10; i++) {
            const x = PRNG() % w;
            const y = PRNG() % h;
            const r = PRNG() % 255;
            const g = PRNG() % 255;
            const b = PRNG() % 255;
            const a = 0.05; // Visible enough but subtle

            ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
            ctx.fillRect(x, y, 1, 1);
        }
        ctx.globalCompositeOperation = prev;
    }

    function applyNoiseWebGL(pixels) {
        if (!PRNG || !pixels) return;
        const len = pixels.length;
        const max = Math.min(len, 4096);
        // Flip 20 bits
        for (let i = 0; i < 20; i++) {
            const idx = PRNG() % max;
            pixels[idx] ^= (1 << (PRNG() % 8));
        }
    }

    // --- Hooks ---

    // Canvas 2D
    function hook2D(CanvasProto, CtxProto) {
        if (CanvasProto.toDataURL) {
            const _toDataURL = CanvasProto.toDataURL;
            CanvasProto.toDataURL = function (...args) {
                bump("toDataURL");
                if (PAL_CFG) {
                    try {
                        const ctx = this.getContext("2d", { willReadFrequently: true });
                        if (ctx) {
                            ctx.save();
                            applyNoise2D(ctx, this.width || 300, this.height || 150);
                            ctx.restore();
                        }
                    } catch (e) { }
                }
                return _toDataURL.apply(this, args);
            };
        }

        if (CanvasProto.toBlob) {
            const _toBlob = CanvasProto.toBlob;
            CanvasProto.toBlob = function (cb, ...args) {
                bump("toBlob");
                if (PAL_CFG) {
                    try {
                        const ctx = this.getContext("2d", { willReadFrequently: true });
                        if (ctx) {
                            ctx.save();
                            applyNoise2D(ctx, this.width || 300, this.height || 150);
                            ctx.restore();
                        }
                    } catch (e) { }
                }
                return _toBlob.apply(this, [cb, ...args]);
            };
        }

        if (CanvasProto.convertToBlob) {
            const _convertToBlob = CanvasProto.convertToBlob;
            CanvasProto.convertToBlob = function (options) {
                bump("convertToBlob");
                if (PAL_CFG) {
                    try {
                        const ctx = this.getContext("2d", { willReadFrequently: true });
                        if (ctx) {
                            ctx.save();
                            applyNoise2D(ctx, this.width || 300, this.height || 150);
                            ctx.restore();
                        }
                    } catch (e) { }
                }
                return _convertToBlob.apply(this, [options]);
            };
        }

        // getImageData noise
        const _getImageData = CtxProto.getImageData;
        CtxProto.getImageData = function (...args) {
            const res = _getImageData.apply(this, args);
            if (PAL_CFG && res && res.data) {
                bump("getImageData");
                try {
                    applyNoiseWebGL(res.data);
                } catch (e) { }
            }
            return res;
        };
    }

    // WebGL
    function hookWebGL(GLProto) {
        const _readPixels = GLProto.readPixels;
        GLProto.readPixels = function (...args) {
            const res = _readPixels.apply(this, args);
            if (PAL_CFG) {
                bump("readPixels");
                try {
                    const pixels = args[args.length - 1];
                    if (pixels && pixels.length !== undefined && typeof pixels !== 'number') {
                        applyNoiseWebGL(pixels);
                    }
                } catch (e) { }
            }
            return res;
        };

        const _getParameter = GLProto.getParameter;
        GLProto.getParameter = function (pname) {
            if (!PAL_CFG) return _getParameter.call(this, pname);

            try {
                const orig = _getParameter.call(this, pname);

                // Mask Standard
                if (pname === 0x1F00) { bump("glVendor"); return personaVendorString || "Google Inc. (Intel)"; }
                if (pname === 0x1F01) { bump("glRenderer"); return personaRendererString || "ANGLE (Intel)"; }

                // Check dbg
                const dbg = this.getExtension && this.getExtension('WEBGL_debug_renderer_info');
                if (!dbg) return orig;

                if (pname === dbg.UNMASKED_VENDOR_WEBGL) { bump("glUnmaskedVendor"); return personaVendorString || "Google Inc. (Intel)"; }
                if (pname === dbg.UNMASKED_RENDERER_WEBGL) { bump("glUnmaskedRenderer"); return personaRendererString || "ANGLE (Intel)"; }

                return orig;
            } catch (e) {
                try { return _getParameter.call(this, pname); } catch { return null; }
            }
        };
    }

    // Audio
    function hookAudio(AudioBufferProto) {
        const _getChannelData = AudioBufferProto.getChannelData;
        AudioBufferProto.getChannelData = function(...args) {
            const res = _getChannelData.apply(this, args);
            if (PAL_CFG && res && res.length !== undefined) {
                bump("getChannelData");
                try {
                    if (PRNG) {
                        const len = res.length;
                        const max = Math.min(len, 100); 
                        for (let i = 0; i < max; i++) {
                            const idx = PRNG() % len;
                            res[idx] += ((PRNG() % 100) / 10000000); 
                        }
                    }
                } catch(e) {}
            }
            return res;
        };
    }

    // Install
    try {
        if (window.HTMLCanvasElement) hook2D(HTMLCanvasElement.prototype, CanvasRenderingContext2D.prototype);
        if (window.OffscreenCanvas && window.OffscreenCanvasRenderingContext2D) hook2D(OffscreenCanvas.prototype, OffscreenCanvasRenderingContext2D.prototype);
        if (window.WebGLRenderingContext) hookWebGL(WebGLRenderingContext.prototype);
        if (window.WebGL2RenderingContext) hookWebGL(WebGL2RenderingContext.prototype);
        if (window.AudioBuffer) hookAudio(AudioBuffer.prototype);
    } catch (e) {
        note("error", e.message);
    }

})();
