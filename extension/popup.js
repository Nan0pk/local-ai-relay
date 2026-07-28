const button = document.getElementById('testHost');
const result = document.getElementById('result');

button.addEventListener('click', () => {
  button.disabled = true;
  result.textContent = 'Connecting…';
  const timeout = setTimeout(() => {
    result.textContent = 'Timed out waiting for the native host.';
    button.disabled = false;
  }, 5000);

  chrome.runtime.sendMessage({
    type: 'RELAY_EVENT',
    payload: {
      request_id: crypto.randomUUID(),
      page_generation: 0,
      sequence_number: 0,
      event_type: 'heartbeat',
      payload: {},
    },
  }, (response) => {
    clearTimeout(timeout);
    const runtimeError = chrome.runtime.lastError?.message;
    if (runtimeError) result.textContent = `Unavailable: ${runtimeError}`;
    else if (!response?.ok) result.textContent = `Unavailable: ${response?.error || 'Native host rejected the request.'}`;
    else result.textContent = 'Native host handshake passed.';
    button.disabled = false;
  });
});
