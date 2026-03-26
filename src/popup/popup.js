document.addEventListener('DOMContentLoaded', async () => {
    const loading = document.getElementById('loading');
    const dashboard = document.getElementById('dashboard');
    const shiftBtn = document.getElementById('shift-btn');

    // UI Elements
    const elId = document.getElementById('persona-id');
    const elName = document.getElementById('persona-name');
    const elOs = document.getElementById('persona-os');
    const elBrowser = document.getElementById('persona-browser');
    const elRes = document.getElementById('persona-res');

    function updateUI(persona) {
        if (!persona) {
            loading.innerHTML = "<h2>No Active Site</h2><p>Visit a website to see identity.</p>";
            shiftBtn.disabled = true;
            return;
        }

        loading.classList.add('hidden');
        dashboard.classList.remove('hidden');
        shiftBtn.disabled = false;

        elId.innerText = persona.id ? (persona.id.substring(0, 16) + "...") : "Unknown";
        elName.innerText = persona.name;
        elOs.innerText = persona.navigator.platform;
        elBrowser.innerText = "Chrome (Spoofed)"; // Simplified for UI
        elRes.innerText = `${persona.screen.width}x${persona.screen.height}`;
    }

    // Initial Load
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // If no tab or internal page, show "No Active Site"
        if (!tab || !tab.url || tab.url.startsWith('chrome://')) {
            updateUI(null);
        } else {
            // Check SW status
            chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("SW Error:", chrome.runtime.lastError);
                    loading.innerHTML = "<h2>Error</h2><p>Service Worker Unreachable. Reload Extension.</p>";
                    return;
                }
                if (response && response.persona) {
                    updateUI(response.persona);
                } else {
                    updateUI(null);
                }
            });
        }
    } catch (e) {
        console.error("Popup Init Error:", e);
        loading.innerHTML = "<h2>Error</h2><p>Popup Init Failed</p>";
    }

    // Shift Action
    shiftBtn.addEventListener('click', async () => {
        shiftBtn.innerText = "Shifting...";
        shiftBtn.disabled = true;

        try {
            chrome.runtime.sendMessage({ type: 'PAL_SHIFT' }, (response) => {
                if (response && response.status === 'rotated') {
                    updateUI(response.persona);
                    shiftBtn.innerText = "Identity Shifted!";

                    // Reload tab to apply
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        if (tabs[0]) chrome.tabs.reload(tabs[0].id);
                    });

                    setTimeout(() => { shiftBtn.innerText = "Shift Identity"; shiftBtn.disabled = false; }, 2000);
                } else {
                    shiftBtn.innerText = "Failed";
                    setTimeout(() => { shiftBtn.innerText = "Shift Identity"; shiftBtn.disabled = false; }, 2000);
                }
            });
        } catch (e) {
            shiftBtn.innerText = "Error";
        }
    });
});
