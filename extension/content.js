// Local AI Relay Sidecar — Content Script
console.log('[Relay Sidecar] Content script injected.');

window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data || event.data.source !== 'RELAY_PAGE') return;
  chrome.runtime.sendMessage({
    type: 'RELAY_EVENT',
    payload: event.data.payload
  });
});
