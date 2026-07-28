const status = document.getElementById('result');
const openDashboard = document.getElementById('openDashboard');
const forget = document.getElementById('forget');

function refresh() {
  chrome.runtime.sendMessage({ type: 'GET_RELAY_STATUS' }, (value) => {
    if (value?.paired) {
      status.textContent = value.lastError
        ? `Paired with ${value.relayOrigin}. Reconnecting: ${value.lastError}`
        : `Paired with ${value.relayOrigin}. Existing-browser mode is available.`;
      forget.hidden = false;
    } else {
      status.textContent = 'Not paired. Open the relay dashboard and choose “Use this Chrome”.';
      forget.hidden = true;
    }
  });
}

openDashboard.addEventListener('click', async () => {
  const stored = await chrome.storage.local.get('relayConnection');
  const origin = stored.relayConnection?.relayOrigin || 'http://127.0.0.1:8787';
  chrome.tabs.create({ url: `${origin}/ui` });
});

forget.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'FORGET_RELAY' }, refresh);
});

refresh();
