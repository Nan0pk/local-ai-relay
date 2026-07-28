import type { FastifyInstance } from 'fastify';

const UI_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Local AI Relay Dashboard</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { margin: 0; background: #0b1220; color: #e5e7eb; }
    main { max-width: 960px; margin: auto; padding: 24px; }
    header, .row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    header { justify-content: space-between; }
    section { margin-top: 20px; padding: 18px; border: 1px solid #334155; border-radius: 12px; background: #111827; }
    button, input, select, textarea { font: inherit; border: 1px solid #475569; border-radius: 7px; padding: 8px 10px; }
    button { cursor: pointer; background: #2563eb; color: white; }
    button.secondary { background: #334155; }
    input, select, textarea { background: #0f172a; color: #e5e7eb; }
    input { min-width: 320px; }
    select, textarea { width: 100%; }
    textarea { min-height: 90px; resize: vertical; margin: 10px 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); gap: 12px; }
    .card { padding: 12px; border: 1px solid #334155; border-radius: 8px; }
    .muted { color: #94a3b8; }
    .ready { color: #4ade80; }
    .degraded { color: #facc15; }
    .error { color: #f87171; white-space: pre-wrap; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #020617; padding: 12px; border-radius: 8px; }
    label { display: block; margin-bottom: 6px; }
  </style>
</head>
<body>
<main>
  <header>
    <div><h1>Local AI Relay</h1><div class="muted">Authenticated loopback operator view</div></div>
    <button class="secondary" id="forgetToken">Forget token</button>
  </header>

  <section id="auth">
    <label for="token">Bearer token from ~/.local-ai-relay/token</label>
    <div class="row">
      <input id="token" type="password" autocomplete="off" spellcheck="false">
      <button id="connect">Connect</button>
    </div>
    <p class="muted">Use the token file or your explicit RELAY_API_TOKEN value. The token stays in this tab only and is not written to localStorage.</p>
    <div id="status" class="muted" aria-live="polite"></div>
  </section>

  <section>
    <h2>Provider status</h2>
    <div id="providers" class="grid"><span class="muted">Connect to load status.</span></div>
  </section>

  <section>
    <h2>Prompt smoke test</h2>
    <label for="model">Ready model</label>
    <select id="model" disabled></select>
    <textarea id="prompt" placeholder="Enter a harmless test prompt"></textarea>
    <button id="send" disabled>Send</button>
    <pre id="output">No request sent.</pre>
  </section>
</main>
<script>
  let token = '';
  const byId = (id) => document.getElementById(id);

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        authorization: 'Bearer ' + token,
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + await response.text());
    return response.json();
  }

  function showProviders(records) {
    const root = byId('providers');
    root.replaceChildren();
    for (const record of records) {
      const card = document.createElement('div');
      card.className = 'card';
      const title = document.createElement('strong');
      title.textContent = record.provider_id;
      const state = document.createElement('div');
      state.className = record.status === 'ready' ? 'ready' : record.status === 'degraded' ? 'degraded' : 'muted';
      state.textContent = record.status + (record.evidence_expired ? ' (evidence expired)' : '');
      const detail = document.createElement('div');
      detail.className = 'muted';
      detail.textContent = record.detail || 'No runtime evidence.';
      card.append(title, state, detail);
      root.append(card);
    }
  }

  async function connect() {
    token = byId('token').value.trim();
    if (!token) throw new Error('Enter the relay bearer token.');
    const [providerBody, modelBody] = await Promise.all([
      api('/v1/providers/status'),
      api('/v1/models'),
    ]);
    showProviders(providerBody.data || []);
    const model = byId('model');
    model.replaceChildren();
    for (const item of modelBody.data || []) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.id;
      model.append(option);
    }
    model.disabled = model.options.length === 0;
    byId('send').disabled = model.disabled;
    byId('status').className = model.disabled ? 'degraded' : 'ready';
    byId('status').textContent = model.disabled ? 'Connected, but no models are currently ready.' : 'Connected.';
  }

  byId('connect').addEventListener('click', () => connect().catch((error) => {
    byId('status').className = 'error';
    byId('status').textContent = error.message;
  }));
  byId('token').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') byId('connect').click();
  });
  byId('forgetToken').addEventListener('click', () => {
    token = '';
    byId('token').value = '';
    byId('model').replaceChildren();
    byId('model').disabled = true;
    byId('send').disabled = true;
    byId('providers').replaceChildren(document.createTextNode('Connect to load status.'));
    byId('status').className = 'muted';
    byId('status').textContent = 'Token forgotten.';
  });
  byId('send').addEventListener('click', async () => {
    const output = byId('output');
    output.textContent = 'Waiting…';
    try {
      const result = await api('/v1/responses', {
        method: 'POST',
        body: JSON.stringify({
          model: byId('model').value,
          input: byId('prompt').value,
        }),
      });
      output.textContent = result.output_text || JSON.stringify(result, null, 2);
    } catch (error) {
      output.textContent = error.message;
    }
  });
</script>
</body>
</html>`;

export function registerUiRoutes(fastify: FastifyInstance): void {
  fastify.get('/ui', async (_request, reply) => {
    reply
      .header('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'")
      .header('Cache-Control', 'no-store')
      .header('Referrer-Policy', 'no-referrer')
      .header('X-Content-Type-Options', 'nosniff')
      .type('text/html')
      .send(UI_HTML);
  });

  fastify.get('/dashboard', async (_request, reply) => {
    reply.redirect('/ui');
  });
}
