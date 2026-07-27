// Local AI Relay Sidecar — Service Worker (MV3)
const RELAY_ENDPOINT = 'http://127.0.0.1:18789/v1/relay-sidecar';

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Relay Sidecar] Extension installed.');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'RELAY_EVENT') {
    fetch(RELAY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message.payload)
    })
    .then(res => res.json())
    .then(data => sendResponse({ ok: true, data }))
    .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});
