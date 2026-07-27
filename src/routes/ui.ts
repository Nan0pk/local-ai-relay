import type { FastifyInstance } from 'fastify';

const UI_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>⚡ Local AI Relay Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f6f8fa; color: #1e293b; padding: 1.5rem; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { font-size: 1.8rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; }
    .header-actions { margin-left: auto; display: flex; gap: 0.5rem; align-items: center; }
    .token-display { background: #e2e8f0; padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.75rem; font-family: monospace; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; margin: 1.5rem 0; }
    .card { background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 1.25rem; transition: box-shadow 0.2s; }
    .card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .card h3 { font-size: 1rem; font-weight: 600; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem; }
    .status-badge { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 999px; font-size: 0.7rem; font-weight: 600; }
    .status-ready { background: #dcfce7; color: #166534; }
    .status-degraded { background: #fef9c3; color: #854d0e; }
    .status-disabled { background: #fee2e2; color: #991b1b; }
    .status-installed { background: #e2e8f0; color: #475569; }
    .btn { background: #e2e8f0; border: none; padding: 0.4rem 0.8rem; border-radius: 6px; font-size: 0.8rem; cursor: pointer; }
    .btn-primary { background: #2563eb; color: white; }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-danger { background: #dc2626; color: white; }
    .btn-danger:hover { background: #b91c1c; }
    .form-group { margin: 0.5rem 0; }
    .form-group label { display: block; font-size: 0.8rem; font-weight: 500; color: #475569; }
    .form-group input, .form-group select { width: 100%; padding: 0.4rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.9rem; }
    .sandbox { margin-top: 2rem; }
    .sandbox textarea { width: 100%; min-height: 80px; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 6px; font-family: monospace; }
    .sandbox .response { background: #f1f5f9; padding: 0.75rem; border-radius: 6px; white-space: pre-wrap; font-family: monospace; margin-top: 0.5rem; }
    .flex-row { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
  </style>
</head>
<body>
<div class="container">
  <h1>
    ⚡ Local AI Relay
    <span class="header-actions">
      <span class="token-display" id="tokenDisplay">••••••••</span>
      <button class="btn" id="toggleTokenBtn">Show</button>
      <button class="btn btn-primary" id="regenerateTokenBtn">Regenerate</button>
    </span>
  </h1>

  <h2>Provider Status</h2>
  <div id="providerCards" class="grid"></div>

  <div class="card">
    <h3>🔧 Local Upstream Configuration</h3>
    <div class="form-group">
      <label>Ollama Base URL</label>
      <input type="text" id="ollamaUrl" value="http://127.0.0.1:11434" />
    </div>
    <div class="form-group">
      <label>llama.cpp Base URL</label>
      <input type="text" id="llamacppUrl" value="http://127.0.0.1:8080" />
    </div>
    <div class="flex-row">
      <button class="btn btn-primary" id="saveLocalConfigBtn">Save Local Config</button>
      <button class="btn" id="probeLocalBtn">Probe Local Engines</button>
    </div>
  </div>

  <div class="card">
    <h3>🌐 Browser Login Launcher</h3>
    <div id="loginButtons" class="flex-row"></div>
  </div>

  <div class="card sandbox">
    <h3>🧪 Interactive Prompt Sandbox</h3>
    <div class="form-group">
      <label>Model</label>
      <select id="modelSelect"></select>
    </div>
    <div class="form-group">
      <label>Prompt</label>
      <textarea id="promptInput" placeholder="Enter your prompt...">Explain quantum computing in simple terms.</textarea>
    </div>
    <div class="flex-row">
      <button class="btn btn-primary" id="sendPromptBtn">Send Test Request</button>
      <button class="btn" id="clearResponseBtn">Clear</button>
    </div>
    <div class="response" id="responseOutput">Response will appear here...</div>
    <div id="latencyDisplay" style="font-size:0.8rem;color:#64748b;margin-top:0.25rem;"></div>
  </div>
</div>

<script>
  let token = localStorage.getItem('relay_token') || '';
  let providers = [];
  let models = [];

  async function apiFetch(path, options = {}) {
    const headers = {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
      ...options.headers,
    };
    const res = await fetch(path, { ...options, headers });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(\`API error \${res.status}: \${err}\`);
    }
    return res.json();
  }

  function renderProviderCards() {
    const container = document.getElementById('providerCards');
    container.innerHTML = '';
    for (const p of providers) {
      const statusClass = p.status === 'ready' ? 'ready' : p.status === 'degraded' ? 'degraded' : p.status === 'disabled' ? 'disabled' : 'installed';
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = \`
        <h3>
          \${p.name || p.id}
          <span class="status-badge status-\${statusClass}">\${p.status}</span>
        </h3>
        <div style="font-size:0.85rem;color:#64748b;">Evidence: \${p.evidence?.detail || 'N/A'}</div>
        <div style="margin-top:0.5rem;" class="flex-row">
          <button class="btn" data-provider="\${p.id}" data-action="login">Login</button>
          <button class="btn" data-provider="\${p.id}" data-action="probe">Probe</button>
          <button class="btn btn-danger" data-provider="\${p.id}" data-action="clear">Clear Evidence</button>
        </div>
      \`;
      container.appendChild(card);
    }

    document.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const providerId = btn.dataset.provider;
        const action = btn.dataset.action;
        try {
          if (action === 'login') {
            await apiFetch(\`/api/providers/\${providerId}/login\`, { method: 'POST' });
            alert('Login session launched. Check browser.');
          } else if (action === 'probe') {
            await apiFetch(\`/api/providers/\${providerId}/probe\`, { method: 'POST' });
            await refreshProviders();
          } else if (action === 'clear') {
            await apiFetch(\`/api/providers/\${providerId}/evidence\`, { method: 'DELETE' });
            await refreshProviders();
          }
        } catch (err) {
          alert('Error: ' + err.message);
        }
      });
    });
  }

  async function refreshProviders() {
    try {
      const data = await apiFetch('/api/providers');
      providers = data.providers || [];
      renderProviderCards();
    } catch (err) {
      console.error('Failed to fetch providers:', err);
    }
  }

  async function refreshModels() {
    try {
      const data = await apiFetch('/v1/models');
      models = data.data || [];
      const select = document.getElementById('modelSelect');
      select.innerHTML = '';
      for (const m of models) {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.id;
        select.appendChild(opt);
      }
    } catch (err) {
      console.error('Failed to fetch models:', err);
    }
  }

  document.getElementById('toggleTokenBtn').addEventListener('click', () => {
    const display = document.getElementById('tokenDisplay');
    if (display.textContent === '••••••••') {
      display.textContent = token || 'No token';
    } else {
      display.textContent = '••••••••';
    }
  });

  document.getElementById('sendPromptBtn').addEventListener('click', async () => {
    const model = document.getElementById('modelSelect').value;
    const input = document.getElementById('promptInput').value;
    if (!model) { alert('Please select a model.'); return; }
    const output = document.getElementById('responseOutput');
    const latency = document.getElementById('latencyDisplay');
    output.textContent = 'Waiting for response...';
    latency.textContent = '';
    const start = performance.now();

    try {
      const res = await fetch('/v1/responses', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, input, stream: false }),
      });
      const elapsed = ((performance.now() - start) / 1000).toFixed(2);
      if (!res.ok) {
        const errText = await res.text();
        output.textContent = \`Error \${res.status}: \${errText}\`;
        latency.textContent = \`Elapsed: \${elapsed}s\`;
        return;
      }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || JSON.stringify(data, null, 2);
      output.textContent = content;
      latency.textContent = \`Elapsed: \${elapsed}s | Model: \${model}\`;
    } catch (err) {
      output.textContent = 'Request failed: ' + err.message;
      latency.textContent = '';
    }
  });

  document.getElementById('clearResponseBtn').addEventListener('click', () => {
    document.getElementById('responseOutput').textContent = 'Response will appear here...';
    document.getElementById('latencyDisplay').textContent = '';
  });

  async function init() {
    if (!token) {
      const input = prompt('Please enter your relay bearer token:');
      if (input) {
        token = input;
        localStorage.setItem('relay_token', token);
      } else {
        alert('Token required for API calls.');
        return;
      }
    }
    document.getElementById('tokenDisplay').textContent = '••••••••';
    await refreshProviders();
    await refreshModels();
  }

  init().catch(console.error);
</script>
</body>
</html>`;

export async function registerUiRoutes(fastify: FastifyInstance) {
  fastify.get('/ui', async (_, reply) => {
    reply.type('text/html').send(UI_HTML);
  });

  fastify.get('/dashboard', async (_, reply) => {
    reply.redirect('/ui');
  });
}
