import type { FastifyInstance } from 'fastify';
import { DASHBOARD_CSS, DASHBOARD_JS } from '../ui/assets.js';

const UI_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="theme-color" content="#07110f">
  <title>Local AI Relay · Control Center</title>
  <link rel="stylesheet" href="/ui/app.css">
</head>
<body>
  <div class="ambient ambient-a"></div><div class="ambient ambient-b"></div>
  <header class="topbar">
    <a class="brand" href="/ui" aria-label="Local AI Relay dashboard">
      <span class="brand-mark" aria-hidden="true">L</span>
      <span><strong>Local AI Relay</strong><small>Control Center</small></span>
    </a>
    <div class="top-actions">
      <span id="pollState" class="quiet">Offline</span>
      <button id="refresh" class="icon-button" title="Refresh" disabled>↻</button>
      <button id="forgetToken" class="button secondary" disabled>Lock</button>
    </div>
  </header>

  <main>
    <section id="unlockView" class="unlock-view">
      <div class="unlock-copy">
        <span class="eyebrow">Private · loopback only</span>
        <h1>One local doorway to your AI providers.</h1>
        <p>Connect browser providers, choose how requests are routed, configure coding harnesses, and understand failures without hunting through terminals.</p>
        <div class="trust-row">
          <span>◉ Local control plane</span><span>◉ Revocable harness keys</span><span>◉ Reversible config</span>
        </div>
      </div>
      <form id="unlockForm" class="unlock-card">
        <div class="card-icon">⌁</div>
        <h2>Unlock this relay</h2>
        <p class="quiet">The desktop launcher unlocks this page automatically. The installer and <code>npm run dashboard</code> also print the token. For a direct bookmark, run <code>cat ~/.local-ai-relay/token</code> (Linux/macOS) or <code>Get-Content "$env:USERPROFILE\\.local-ai-relay\\token"</code> (PowerShell).</p>
        <label for="token">Relay bearer token</label>
        <input id="token" type="password" autocomplete="off" spellcheck="false" placeholder="lar_••••••••••••">
        <button class="button primary wide" type="submit">Open control center</button>
        <p id="unlockError" class="error" role="alert"></p>
      </form>
    </section>

    <div id="appView" hidden>
      <section class="hero">
        <div>
          <span class="eyebrow">Operator overview</span>
          <h1>Your local AI switchboard</h1>
          <p id="heroSummary" class="quiet">Loading relay state…</p>
        </div>
        <div class="hero-actions">
          <button id="connectAvailable" class="button primary">Scan login-free chats</button>
          <button id="runDoctor" class="button secondary">Check setup</button>
          <button id="openLogs" class="button secondary">Activity & errors</button>
        </div>
      </section>

      <section class="metric-grid" aria-label="Relay overview">
        <article class="metric"><span class="status-dot" id="relayDot"></span><div><small>Relay server</small><strong id="relayStatus">Loading</strong><span id="relayDetail">—</span></div></article>
        <article class="metric"><span class="metric-icon">⌁</span><div><small>Ready providers</small><strong id="readyCount">0</strong><span id="providerDetail">Checking connections</span></div></article>
        <article class="metric"><span class="metric-icon">⇄</span><div><small>Routing</small><strong id="routingStatus">—</strong><span id="routingDetail">No policy loaded</span></div></article>
        <article class="metric"><span class="metric-icon">◇</span><div><small>Harnesses</small><strong id="harnessCount">0 connected</strong><span>Scoped, removable integrations</span></div></article>
      </section>

      <section class="browser-panel panel">
        <div class="browser-copy">
          <span class="status-dot" id="browserDot"></span>
          <div>
            <span class="eyebrow">Browser connection</span>
            <h2 id="browserMode">Shared relay browser</h2>
            <p id="browserDetail">Checking whether this Chrome profile is paired…</p>
          </div>
        </div>
        <div class="browser-actions">
          <button id="useThisBrowser" class="button primary">Use this Chrome</button>
          <details id="extensionHelp">
            <summary>Install the Chrome extension</summary>
            <ol>
              <li>Open <code>chrome://extensions</code>.</li>
              <li>Enable <strong>Developer mode</strong> and choose <strong>Load unpacked</strong>.</li>
              <li>Select <code id="extensionPath">extension</code> <button id="copyExtensionPath" class="button secondary" type="button">Copy path</button>, return here, then click <strong>Use this Chrome</strong>.</li>
              <li>The extension controls only provider tabs opened by this relay. Remove it any time to stop existing-browser access.</li>
            </ol>
          </details>
        </div>
      </section>

      <div class="layout">
        <div class="main-column">
          <section class="panel">
            <div class="section-heading">
              <div><span class="eyebrow">Step 1 · Connections</span><h2>Providers connect automatically</h2><p>On startup, likely login-free chats are verified one at a time in the background. Access changes by region, quota, and provider policy. Anything needing an account is left for you to open and sign in manually.</p></div>
              <div class="legend"><span><i class="dot ready"></i>Ready</span><span><i class="dot warning"></i>Needs attention</span><a class="link-button" href="https://github.com/Nan0pk/local-ai-relay/issues/new?template=provider.yml" target="_blank" rel="noopener noreferrer">Request provider ↗</a></div>
            </div>
            <div id="providerGrid" class="provider-grid" aria-live="polite"></div>
          </section>

          <section class="panel">
            <div class="section-heading">
              <div><span class="eyebrow">Step 2 · Work</span><h2>Connect your harness</h2><p>Connect only after at least one provider is ready. The relay changes only its own entries; existing settings are preserved and backed up.</p></div>
              <button id="disconnectAll" class="button danger subtle">Disconnect all</button>
            </div>
            <div id="harnessGrid" class="harness-grid"></div>
          </section>

          <section class="panel">
            <div class="section-heading"><div><span class="eyebrow">Verification</span><h2>Try the relay</h2><p>Send a harmless prompt through the current routing policy.</p></div></div>
            <div class="test-grid">
              <label>Model<select id="testModel"><option value="relay-auto">relay-auto</option></select></label>
              <label class="prompt-label">Prompt<textarea id="testPrompt">Reply with a short confirmation that the relay is working.</textarea></label>
              <button id="sendTest" class="button primary">Send test</button>
            </div>
            <pre id="testOutput" class="output">No test sent yet.</pre>
          </section>
        </div>

        <aside class="side-column">
          <section class="panel sticky-panel">
            <div class="section-heading compact"><div><span class="eyebrow">Policy</span><h2>Routing</h2></div><span id="saveState" class="quiet"></span></div>
            <label class="switch-row"><span><strong>Auto routing</strong><small>Use a virtual relay model</small></span><input id="routingEnabled" type="checkbox"><i></i></label>
            <details class="advanced-routing">
              <summary>Provider choice and advanced routing</summary>
              <div class="field">
                <label for="routingMode">Mode</label>
                <select id="routingMode"><option value="automatic">Automatic</option><option value="priority">Priority order</option><option value="manual">Manual model</option></select>
              </div>
              <div class="field">
                <label for="routingPreset">Optimization</label>
                <select id="routingPreset"><option value="reliable">Most reliable</option><option value="fast">Fast response</option><option value="custom">My priority order</option></select>
              </div>
              <div class="field">
                <label for="manualModel">Manual model</label>
                <select id="manualModel"></select>
              </div>
              <fieldset><legend>Allowed providers</legend><div id="providerChoices" class="choice-list"></div></fieldset>
              <label class="check-row"><input id="allowFallbacks" type="checkbox"><span>Allow a fallback only when failure is known to happen before submission</span></label>
            </details>
            <button id="saveRouting" class="button primary wide">Save routing</button>
            <p class="microcopy">Every automatic selection is logged with the chosen model and reason.</p>
          </section>
        </aside>
      </div>
    </div>
  </main>

  <dialog id="activityDialog">
    <div class="dialog-heading"><div><span class="eyebrow">Diagnostics</span><h2>Activity & errors</h2></div><button class="icon-button close-dialog" aria-label="Close">×</button></div>
    <div id="eventList" class="event-list"></div>
  </dialog>
  <dialog id="resultDialog">
    <div class="dialog-heading"><div><span class="eyebrow">Connection details</span><h2 id="resultTitle">Harness ready</h2></div><button class="icon-button close-dialog" aria-label="Close">×</button></div>
    <p id="resultIntro"></p><pre id="resultBody" class="output"></pre>
    <p class="quiet">Copy this now. The scoped key is shown only in this connection response and can be revoked from the Harnesses panel.</p>
  </dialog>
  <dialog id="doctorDialog">
    <div class="dialog-heading"><div><span class="eyebrow">Setup doctor</span><h2>System check</h2></div><button class="icon-button close-dialog" aria-label="Close">×</button></div>
    <div id="doctorList" class="doctor-list"></div>
    <p id="doctorPath" class="quiet"></p>
  </dialog>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>
  <script src="/ui/app.js" defer></script>
</body>
</html>`;

const securityHeaders = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

export function registerUiRoutes(fastify: FastifyInstance): void {
  fastify.get('/ui', async (_request, reply) => {
    reply
      .headers(securityHeaders)
      .header(
        'Content-Security-Policy',
        "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
      )
      .type('text/html')
      .send(UI_HTML);
  });

  fastify.get('/ui/app.css', async (_request, reply) => {
    reply.headers(securityHeaders).type('text/css').send(DASHBOARD_CSS);
  });

  fastify.get('/ui/app.js', async (_request, reply) => {
    reply.headers(securityHeaders).type('application/javascript').send(DASHBOARD_JS);
  });

  fastify.get('/dashboard', async (_request, reply) => {
    reply.redirect('/ui');
  });
}
