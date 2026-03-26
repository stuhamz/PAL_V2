// src/content/loader.js
// Config Bridge (Isolated -> Main)

(async () => {
    console.log("PAL LOADER STARTED");

    function injectConfig() {
        if (!document.documentElement) return false;

        try {
            // Default Config
            let config = {
                enabled: true,
                personaIndex: 0,
                baseSeed: 0xDEADBEEF,
                sessionSeed: 0
            };

            // Merge test harness configs
            if (typeof window !== 'undefined' && window.__PAL_CONFIG) {
                Object.assign(config, window.__PAL_CONFIG);
            }

            // 1. Session Seed
            try {
                config.sessionSeed = crypto.getRandomValues(new Uint32Array(1))[0];
            } catch (e) {
                config.sessionSeed = (Date.now() ^ Math.floor(Math.random() * 0xFFFFFFFF)) >>> 0;
            }

            // 2. Storage (Async, could be slow, so we inject default first?)
            // To be safe, let's just use default if storage fails/hangs, but normally we wait.
            // Actually, we can't wait too long at document_start.
            // Let's try to get storage.

            // We will just write what we have immediately to ensure prehook has SOMETHING.
            // Then update it? No, prehook reads once.
            // We must block briefly or just accept defaults if storage ignores us.

            // RE-DESIGN:
            // We need 'await chrome.storage' for Persona/BaseSeed.
            // If we can't get it, we use default.

            chrome.storage.local.get(["pal_enabled", "pal_persona_index", "pal_base_seed"]).then((data) => {
                if (data.pal_enabled === false) config.enabled = false;
                if (typeof data.pal_persona_index === 'number') config.personaIndex = data.pal_persona_index;
                if (typeof data.pal_base_seed === 'number') config.baseSeed = data.pal_base_seed;

                checkAutomationAndWrite(config);
            }).catch(() => {
                checkAutomationAndWrite(config);
            });

        } catch (e) {
            console.error("PAL LOADER ERROR", e);
        }
        return true;
    }

    function checkAutomationAndWrite(config) {
        // Automation Override
        try {
            const debugPersona = sessionStorage.getItem("pal_debug_persona");
            if (debugPersona !== null) {
                const pIdx = parseInt(debugPersona, 10);
                if (!isNaN(pIdx)) {
                    config.personaIndex = pIdx;
                }
            }
        } catch (e) { }

        const exportConfig = {
            enabled: config.enabled,
            personaIndex: config.personaIndex >>> 0,
            baseSeed: config.baseSeed >>> 0,
            sessionSeed: config.sessionSeed >>> 0,
            mode: config.mode,
            epoch_id: config.epoch_id
        };

        if (document.documentElement) {
            document.documentElement.setAttribute("data-pal-config", JSON.stringify(exportConfig));
            console.log("PAL LOADER WROTE CONFIG", exportConfig);
        }
    }

    // Retry logic
    if (!injectConfig()) {
        console.log("PAL LOADER: documentElement missing, waiting...");
        const observer = new MutationObserver(() => {
            if (document.documentElement) {
                console.log("PAL LOADER: documentElement appeared");
                injectConfig();
                observer.disconnect();
            }
        });
        observer.observe(document, { childList: true, subtree: true });
    }

})();
