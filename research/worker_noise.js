// worker_noise.js
// Injected into Web Worker contexts by crawler_research.js BEFORE research_probe.js runs.
// Mirrors the noise hooks from prehook.js but operates on OffscreenCanvas / AudioBuffer
// which are the only canvas-like APIs available inside workers.
// Config is read from self.__PAL_CONFIG (set by crawler before inject).

(function () {
    if (self.__pal_worker_hook_installed__) return;
    self.__pal_worker_hook_installed__ = true;

    const cfg = self.__PAL_CONFIG || null;
    if (!cfg || cfg.mode === 'vanilla' || cfg.mode === 'compat') return;

    // --- Seeding ---
    function hash32(a, b, c) {
        let x = (a ^ (b * 0x9e3779b1)) >>> 0;
        x = (x ^ (c * 0x85ebca6b)) >>> 0;
        x ^= x >>> 16;
        x = Math.imul(x, 0x7feb352d) >>> 0;
        x ^= x >>> 15;
        return x >>> 0;
    }

    const BASE = (cfg.baseSeed >>> 0) || 0x9e3779b1;
    const PIDX = (cfg.personaIndex >>> 0) || 0;
    const SESS = (cfg.sessionSeed >>> 0) || (cfg.epoch_id >>> 0) || 0;
    let noiseSeed = hash32(BASE, PIDX, SESS);

    function lcg() {
        noiseSeed = (Math.imul(1664525, noiseSeed) + 1013904223) >>> 0;
        return noiseSeed;
    }

    // --- Noise ---
    function applyNoise2D(ctx, w, h) {
        const prev = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'source-over';
        for (let i = 0; i < 10; i++) {
            ctx.fillStyle = `rgba(${lcg() % 255},${lcg() % 255},${lcg() % 255},0.05)`;
            ctx.fillRect(lcg() % w, lcg() % h, 1, 1);
        }
        ctx.globalCompositeOperation = prev;
    }

    function applyNoisePixels(pixels) {
        const max = Math.min(pixels.length, 4096);
        for (let i = 0; i < 20; i++) {
            pixels[lcg() % max] ^= (1 << (lcg() % 8));
        }
    }

    // --- Hook OffscreenCanvas ---
    if (typeof OffscreenCanvas !== 'undefined') {
        // Hook getImageData on OffscreenCanvasRenderingContext2D
        if (typeof OffscreenCanvasRenderingContext2D !== 'undefined') {
            const proto = OffscreenCanvasRenderingContext2D.prototype;
            const _getImageData = proto.getImageData;
            proto.getImageData = function (...args) {
                const res = _getImageData.apply(this, args);
                if (res && res.data) {
                    try { applyNoisePixels(res.data); } catch (e) {}
                }
                return res;
            };
            // Also hook convertToBlob path via canvas prototype
            const ocProto = OffscreenCanvas.prototype;
            if (ocProto.convertToBlob) {
                const _ctb = ocProto.convertToBlob;
                ocProto.convertToBlob = function (opts) {
                    try {
                        const ctx2d = this.getContext('2d', { willReadFrequently: true });
                        if (ctx2d) applyNoise2D(ctx2d, this.width || 200, this.height || 200);
                    } catch (_) {}
                    return _ctb.apply(this, [opts]);
                };
            }
        }
    }

    // --- Hook WebGL readPixels ---
    function hookGL(GLProto) {
        const _rp = GLProto.readPixels;
        GLProto.readPixels = function (...args) {
            _rp.apply(this, args);
            const pixels = args[args.length - 1];
            if (pixels && typeof pixels !== 'number' && pixels.length !== undefined) {
                try { applyNoisePixels(pixels); } catch (_) {}
            }
        };
        const _gp = GLProto.getParameter;
        GLProto.getParameter = function (pname) {
            // Pass-through — persona masking not needed in workers (no UI rendering)
            return _gp.call(this, pname);
        };
    }
    if (typeof WebGLRenderingContext !== 'undefined') hookGL(WebGLRenderingContext.prototype);
    if (typeof WebGL2RenderingContext !== 'undefined') hookGL(WebGL2RenderingContext.prototype);

    // --- Hook AudioBuffer ---
    if (typeof AudioBuffer !== 'undefined') {
        const _gcd = AudioBuffer.prototype.getChannelData;
        AudioBuffer.prototype.getChannelData = function (...args) {
            const res = _gcd.apply(this, args);
            if (res && res.length) {
                const len = res.length;
                const max = Math.min(len, 100);
                for (let i = 0; i < max; i++) {
                    res[lcg() % len] += ((lcg() % 100) / 10000000);
                }
            }
            return res;
        };
    }
})();
