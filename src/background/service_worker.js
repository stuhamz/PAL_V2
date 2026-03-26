// src/background/service_worker.js
// Handles base seed generation and message routing

import './net.js';
import './policy.js';

// Base Seed Logic
chrome.runtime.onInstalled.addListener(async () => {
    const data = await chrome.storage.local.get(["pal_enabled", "pal_persona_index", "pal_base_seed"]);
    const updates = {};
    if (data.pal_enabled === undefined) updates.pal_enabled = true;
    if (data.pal_persona_index === undefined) updates.pal_persona_index = 0;
    if (!data.pal_base_seed) {
        // Generate stable base seed
        updates.pal_base_seed = crypto.getRandomValues(new Uint32Array(1))[0];
    }
    if (Object.keys(updates).length > 0) {
        await chrome.storage.local.set(updates);
    }
});

// Personas Definition (Simplified for Service Worker response)
const PERSONAS = [
    { id: "std-001", name: "Standard", navigator: { platform: "Win32" }, screen: { width: 1920, height: 1080 } },
    { id: "high-002", name: "High", navigator: { platform: "MacIntel" }, screen: { width: 2560, height: 1440 } },
    { id: "lin-003", name: "Linux", navigator: { platform: "Linux x86_64" }, screen: { width: 1366, height: 768 } },
    { id: "mac-004", name: "Mac", navigator: { platform: "MacIntel" }, screen: { width: 1440, height: 900 } }
];

// Message Listener
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'PAL_HELLO') {
        sendResponse({ status: 'ok' });
    }

    if (msg.type === 'GET_STATUS') {
        // Async handling required, returning true
        chrome.storage.local.get(["pal_persona_index"]).then(data => {
            const pIdx = (data.pal_persona_index || 0) % PERSONAS.length;
            sendResponse({ persona: PERSONAS[pIdx] });
        });
        return true;
    }

    if (msg.type === 'PAL_SHIFT') {
        chrome.storage.local.get(["pal_persona_index"]).then(data => {
            const current = data.pal_persona_index || 0;
            const next = (current + 1) % PERSONAS.length;

            chrome.storage.local.set({ pal_persona_index: next }).then(() => {
                sendResponse({ status: 'rotated', persona: PERSONAS[next] });
            });
        });
        return true;
    }
});
