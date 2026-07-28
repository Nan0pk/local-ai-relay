window.addEventListener('message', (event) => {
  if (
    location.pathname !== '/ui'
    || event.source !== window
    || event.origin !== location.origin
    || event.data?.source !== 'local-ai-relay-dashboard'
    || !['PAIR_RELAY', 'FORGET_RELAY'].includes(event.data?.type)
  ) return;
  chrome.runtime.sendMessage({
    type: event.data.type,
    relayOrigin: location.origin,
    token: event.data.token,
  }, (response) => {
    window.postMessage({
      source: 'local-ai-relay-extension',
      type: `${event.data.type}_RESULT`,
      ok: response?.ok === true,
      error: response?.error || chrome.runtime.lastError?.message || '',
    }, location.origin);
  });
});
