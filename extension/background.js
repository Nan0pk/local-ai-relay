// Experimental Native Messaging control bridge. Provider automation remains
// on the Patchright transport until the extension vertical slice is proven.
const HOST_NAME = 'com.local_ai_relay.host';
let port;
let ready = false;
let helloRequestId;
const sessionId = `extension-${crypto.randomUUID()}`;
const pending = new Map();
const queued = [];

function sendHello() {
  helloRequestId = `hello-${crypto.randomUUID()}`;
  port.postMessage({
    protocol_version: '2.0',
    request_id: helloRequestId,
    session_id: sessionId,
    page_generation: 0,
    sequence_number: 0,
    event_type: 'hello',
    payload: '{}',
    payload_hash: '',
  });
}

function flushQueue() {
  while (ready && queued.length > 0) port.postMessage(queued.shift());
}

function connect() {
  if (port) return port;
  port = chrome.runtime.connectNative(HOST_NAME);
  port.onMessage.addListener((message) => {
    if (message.request_id === helloRequestId) {
      if (message.event_type === 'ack' || message.event_type === 'resume') {
        ready = true;
        flushQueue();
      } else {
        const error = 'Native host rejected the extension handshake.';
        for (const callback of pending.values()) callback({ ok: false, error });
        pending.clear();
        queued.length = 0;
      }
      return;
    }
    const callback = pending.get(message.request_id);
    if (callback) {
      pending.delete(message.request_id);
      callback({ ok: message.event_type !== 'error', data: message });
    }
  });
  port.onDisconnect.addListener(() => {
    const error = chrome.runtime.lastError?.message || 'Native host disconnected.';
    for (const callback of pending.values()) callback({ ok: false, error });
    pending.clear();
    queued.length = 0;
    ready = false;
    helloRequestId = undefined;
    port = undefined;
  });
  sendHello();
  return port;
}

function sendHeartbeat() {
  chrome.runtime.sendMessage({
    type: 'RELAY_EVENT',
    payload: {
      request_id: crypto.randomUUID(),
      page_generation: 0,
      sequence_number: 0,
      event_type: 'heartbeat',
      payload: {},
    },
  }, () => void chrome.runtime.lastError);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('relay-heartbeat', { periodInMinutes: 1 });
  sendHeartbeat();
});

chrome.runtime.onStartup.addListener(sendHeartbeat);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'relay-heartbeat') sendHeartbeat();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'RELAY_EVENT' || !message.payload) return false;
  const requestId = message.payload.request_id || crypto.randomUUID();
  pending.set(requestId, sendResponse);
  connect();
  const frame = {
    protocol_version: '2.0',
    request_id: requestId,
    session_id: sessionId,
    page_generation: Number(message.payload.page_generation || 0),
    sequence_number: Number(message.payload.sequence_number || 0),
    event_type: message.payload.event_type || 'capabilities',
    payload: typeof message.payload.payload === 'string'
      ? message.payload.payload
      : JSON.stringify(message.payload.payload || {}),
    payload_hash: message.payload.payload_hash || '',
  };
  if (ready) port.postMessage(frame);
  else queued.push(frame);
  return true;
});
