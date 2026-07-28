export const DASHBOARD_CSS = String.raw`
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--bg:#07110f;--panel:#0d1916;--panel-2:#111f1b;--line:#20352e;--text:#f2f7f5;--muted:#8fa69e;--mint:#5ee6b0;--mint-2:#28b987;--amber:#ffcb6b;--red:#ff7c7c;--shadow:0 24px 70px rgba(0,0,0,.32)}
*{box-sizing:border-box}body{margin:0;min-width:320px;background:radial-gradient(circle at 45% -20%,#15382e 0,transparent 38%),var(--bg);color:var(--text);min-height:100vh}button,input,select,textarea{font:inherit}button,a,select,input{transition:border-color .18s,background .18s,transform .18s,opacity .18s}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--mint);outline-offset:2px}.ambient{position:fixed;border-radius:999px;filter:blur(100px);opacity:.1;pointer-events:none}.ambient-a{width:340px;height:340px;background:#35deb0;top:16%;left:-180px}.ambient-b{width:460px;height:460px;background:#287dff;right:-280px;bottom:0}.topbar{height:72px;padding:0 max(24px,calc((100vw - 1440px)/2));border-bottom:1px solid rgba(255,255,255,.07);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10;background:rgba(7,17,15,.82);backdrop-filter:blur(18px)}.brand{display:flex;gap:12px;align-items:center;color:inherit;text-decoration:none}.brand-mark{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;background:linear-gradient(145deg,var(--mint),#2abf92);color:#05251b;font-weight:900;box-shadow:0 8px 24px rgba(94,230,176,.2)}.brand strong,.brand small{display:block}.brand strong{font-size:14px;letter-spacing:.01em}.brand small{font-size:11px;color:var(--muted);margin-top:1px}.top-actions,.hero-actions,.trust-row,.legend{display:flex;align-items:center;gap:10px}main{width:min(1440px,100%);margin:auto;padding:48px 24px 80px}.unlock-view{min-height:calc(100vh - 168px);display:grid;grid-template-columns:minmax(0,1.25fr) minmax(340px,.65fr);align-items:center;gap:8vw}.unlock-copy{max-width:760px}.eyebrow{display:block;color:var(--mint);text-transform:uppercase;letter-spacing:.14em;font-weight:750;font-size:11px;margin-bottom:9px}.unlock-copy h1,.hero h1{font-size:clamp(42px,6vw,76px);line-height:.98;letter-spacing:-.055em;margin:0 0 24px;max-width:900px}.unlock-copy>p{font-size:19px;line-height:1.65;color:#b8cac4;max-width:680px}.trust-row{color:var(--muted);font-size:12px;margin-top:28px;flex-wrap:wrap}.trust-row span::first-letter{color:var(--mint)}.unlock-card,.panel,.metric{border:1px solid var(--line);background:linear-gradient(145deg,rgba(17,31,27,.96),rgba(10,23,19,.96));box-shadow:var(--shadow)}.unlock-card{border-radius:22px;padding:34px}.card-icon{width:48px;height:48px;border:1px solid #345f51;background:#122a22;color:var(--mint);border-radius:14px;display:grid;place-items:center;font-size:27px}.unlock-card h2{font-size:25px;margin:22px 0 8px}.quiet{color:var(--muted)}.unlock-card p{font-size:13px;line-height:1.55}.unlock-card label,.field label,.test-grid label{font-size:12px;color:#bfd0ca;font-weight:650;display:block;margin:22px 0 8px}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#c6f8e5}.unlock-card input{width:100%;height:48px;background:#07130f;color:white;border:1px solid #2a423a;border-radius:10px;padding:0 13px}.button,.icon-button{border:1px solid transparent;cursor:pointer}.button{border-radius:9px;padding:10px 15px;font-weight:700;font-size:13px}.button:hover,.icon-button:hover{transform:translateY(-1px)}.button:disabled,.icon-button:disabled{opacity:.38;cursor:not-allowed;transform:none}.primary{background:var(--mint);color:#062218}.primary:hover{background:#76efbf}.secondary{background:#14231f;border-color:#2b4039;color:#dce9e4}.danger{color:#ffaaa2;border-color:#6a3735;background:#281a19}.subtle{background:transparent}.wide{width:100%;margin-top:15px}.icon-button{width:36px;height:36px;border-radius:9px;background:#13231e;border-color:#2a4038;color:#c7d6d1;font-size:18px}.error{color:var(--red);min-height:20px}.hero{display:flex;align-items:flex-end;justify-content:space-between;gap:30px;margin-bottom:28px}.hero h1{font-size:clamp(36px,5vw,58px);margin-bottom:12px}.hero p{margin:0}.metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:18px}.metric{border-radius:14px;padding:19px;display:flex;gap:14px;align-items:flex-start;box-shadow:none}.metric>div{min-width:0}.metric small,.metric strong,.metric span:not(.status-dot):not(.metric-icon){display:block}.metric small{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.metric strong{font-size:17px;margin:7px 0 4px}.metric div>span{font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.status-dot,.dot{border-radius:999px}.status-dot{width:11px;height:11px;background:var(--mint);box-shadow:0 0 0 5px rgba(94,230,176,.11);margin-top:6px}.metric-icon{width:24px;color:var(--mint);font-size:22px}.layout{display:grid;grid-template-columns:minmax(0,2.05fr) minmax(300px,.72fr);gap:18px;align-items:start}.main-column{display:grid;gap:18px}.panel{border-radius:16px;padding:24px;box-shadow:none}.sticky-panel{position:sticky;top:90px}.section-heading{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:22px}.section-heading.compact{align-items:center}.section-heading h2{font-size:21px;margin:0 0 6px;letter-spacing:-.02em}.section-heading p{color:var(--muted);font-size:12px;line-height:1.55;max-width:670px;margin:0}.legend{font-size:11px;color:var(--muted);white-space:nowrap}.dot{width:7px;height:7px;display:inline-block;margin-right:5px}.dot.ready{background:var(--mint)}.dot.warning{background:var(--amber)}.provider-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.provider-card{border:1px solid var(--line);border-radius:13px;padding:16px;background:rgba(5,15,12,.4)}.provider-top,.provider-status,.card-actions,.harness-card{display:flex;align-items:center}.provider-top{justify-content:space-between;gap:12px}.provider-name{display:flex;gap:10px;align-items:center}.provider-glyph{width:33px;height:33px;border-radius:10px;background:#173028;display:grid;place-items:center;color:var(--mint);font-weight:850}.provider-name strong{font-size:13px}.provider-name small{display:block;color:var(--muted);font-size:10px;margin-top:2px}.provider-status{gap:6px;font-size:10px;text-transform:uppercase;letter-spacing:.07em;font-weight:800;color:var(--muted)}.provider-card>p{font-size:11px;color:var(--muted);line-height:1.5;min-height:34px}.card-actions{gap:8px;flex-wrap:wrap}.card-actions .button{padding:7px 9px;font-size:11px}.link-button{color:var(--mint);font-size:11px;text-decoration:none;padding:6px 0}.link-button:hover{text-decoration:underline}.warning-text{color:var(--amber)!important}.failed-text{color:var(--red)!important}.harness-grid{display:grid;gap:9px}.harness-card{border:1px solid var(--line);border-radius:12px;padding:14px;justify-content:space-between;gap:14px}.harness-info strong{font-size:13px}.harness-info span{font-size:11px;color:var(--muted);display:block;margin-top:4px}.harness-badge{font-size:10px;border-radius:99px;padding:4px 8px;background:#162720;color:var(--muted);margin-right:8px}.harness-badge.connected{color:var(--mint);background:#123226}.switch-row{display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid var(--line);cursor:pointer}.switch-row span strong,.switch-row span small{display:block}.switch-row span strong{font-size:13px}.switch-row span small{font-size:10px;color:var(--muted);margin-top:3px}.switch-row input{position:absolute;opacity:0}.switch-row i{width:40px;height:22px;border-radius:99px;background:#293b35;position:relative}.switch-row i::after{content:"";position:absolute;width:16px;height:16px;border-radius:99px;background:#a5b4af;top:3px;left:3px;transition:.18s}.switch-row input:checked+i{background:var(--mint-2)}.switch-row input:checked+i::after{transform:translateX(18px);background:white}.field{margin-top:16px}.field label{margin:0 0 7px}.field select,.test-grid select,.test-grid textarea{width:100%;background:#091510;border:1px solid #293f37;color:#e9f1ee;border-radius:8px;padding:9px}fieldset{border:0;padding:0;margin:18px 0}legend{font-size:12px;font-weight:650;margin-bottom:9px}.choice-list{max-height:210px;overflow:auto;border:1px solid var(--line);border-radius:9px}.choice-row,.check-row{display:flex;gap:9px;align-items:flex-start;font-size:11px;color:#c2d0cb}.choice-row{padding:9px;border-bottom:1px solid var(--line)}.choice-row:last-child{border:0}.choice-row input,.check-row input{accent-color:var(--mint)}.check-row{line-height:1.4}.microcopy{font-size:10px;color:var(--muted);line-height:1.5}.test-grid{display:grid;grid-template-columns:200px 1fr auto;align-items:end;gap:12px}.test-grid label{margin:0}.test-grid textarea{resize:vertical;min-height:62px}.output{border:1px solid var(--line);background:#050d0b;color:#c8d9d3;border-radius:10px;padding:14px;white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;margin:14px 0 0;max-height:320px;overflow:auto}dialog{width:min(720px,calc(100vw - 30px));max-height:82vh;background:var(--panel);color:var(--text);border:1px solid #385247;border-radius:17px;padding:22px;box-shadow:var(--shadow)}dialog::backdrop{background:rgba(0,0,0,.7);backdrop-filter:blur(5px)}.dialog-heading{display:flex;justify-content:space-between;align-items:flex-start}.dialog-heading h2{margin:0}.event-list{display:grid;gap:8px;overflow:auto;margin-top:18px}.event{border:1px solid var(--line);border-radius:10px;padding:12px}.event.error-event{border-color:#693d3b}.event-head{display:flex;justify-content:space-between;gap:10px}.event strong{font-size:12px}.event time{font-size:10px;color:var(--muted)}.event p{color:var(--muted);font-size:11px;line-height:1.5;margin:6px 0 0}.toast{position:fixed;right:22px;bottom:22px;background:#d7ffef;color:#09261d;padding:11px 15px;border-radius:10px;font-size:12px;font-weight:700;box-shadow:var(--shadow);transform:translateY(90px);opacity:0;transition:.24s;z-index:30}.toast.show{transform:none;opacity:1}[hidden]{display:none!important}
.metric-grid{grid-template-columns:repeat(5,minmax(0,1fr))}
.choice-row{justify-content:space-between;align-items:center}.choice-row label{display:flex;align-items:center;gap:9px;flex:1;cursor:pointer}.choice-order{display:flex;gap:4px}.order-button{border:1px solid #2b4039;background:#14231f;color:#bdd0c9;border-radius:6px;width:25px;height:23px;cursor:pointer}.order-button:hover{border-color:var(--mint)}
@media(max-width:1050px){.metric-grid{grid-template-columns:repeat(2,1fr)}.layout{grid-template-columns:1fr}.sticky-panel{position:static}.side-column{grid-row:1}.provider-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:720px){main{padding:28px 14px 60px}.topbar{padding:0 14px}.unlock-view{grid-template-columns:1fr;gap:34px}.unlock-copy h1{font-size:45px}.trust-row{display:none}.hero{align-items:flex-start;flex-direction:column}.hero-actions{width:100%}.hero-actions .button{flex:1}.metric-grid,.provider-grid{grid-template-columns:1fr}.panel{padding:18px}.section-heading{flex-direction:column}.legend{display:none}.test-grid{grid-template-columns:1fr}.harness-card{align-items:flex-start;flex-direction:column}.harness-card .button{width:100%}}`;

export const DASHBOARD_JS = String.raw`
(() => {
  "use strict";
  let token = "";
  let overview = null;
  let timer = null;
  const $ = (id) => document.getElementById(id);
  const text = (tag, value, className) => { const node = document.createElement(tag); node.textContent = value ?? ""; if (className) node.className = className; return node; };
  const button = (label, className, handler) => { const node = text("button", label, className); node.type = "button"; node.addEventListener("click", handler); return node; };
  const toast = (message) => { $("toast").textContent = message; $("toast").classList.add("show"); setTimeout(() => $("toast").classList.remove("show"), 2600); };
  const messageOf = (value) => value?.error?.message || value?.message || String(value);
  async function api(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { authorization: "Bearer " + token, "content-type": "application/json", ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(messageOf(body) || "HTTP " + response.status);
    return body;
  }
  function statusClass(provider) {
    if (provider.ready) return "ready";
    if (provider.status === "degraded" || provider.status === "needs_login" || provider.latest_job?.status === "running") return "warning";
    return provider.latest_job?.status === "failed" ? "failed" : "idle";
  }
  function statusLabel(provider) {
    if (provider.latest_job?.status === "running") return "Connecting";
    if (provider.ready) return "Ready";
    if (provider.status === "disabled") return "Disabled";
    if (provider.latest_job?.status === "failed") return "Error";
    if (provider.authentication === "optional") return "Available";
    return "Sign in";
  }
  async function providerAction(provider, action) {
    await api("/v1/control/providers/" + encodeURIComponent(provider.id) + "/actions", { method: "POST", body: JSON.stringify({ action }) });
    toast(action === "connect" ? "Connection check started in the relay browser." : "Provider " + action + "d.");
    await refresh();
  }
  function renderProviders(providers) {
    const root = $("providerGrid"); root.replaceChildren();
    for (const provider of providers) {
      const card = document.createElement("article"); card.className = "provider-card";
      const top = document.createElement("div"); top.className = "provider-top";
      const name = document.createElement("div"); name.className = "provider-name";
      name.append(text("span", provider.label.slice(0, 1), "provider-glyph"));
      const title = document.createElement("div"); title.append(text("strong", provider.label), text("small", provider.authentication === "optional" ? "Login optional" : "Official account sign-in"));
      name.append(title);
      const state = document.createElement("span"); state.className = "provider-status " + (statusClass(provider) === "warning" ? "warning-text" : statusClass(provider) === "failed" ? "failed-text" : "");
      state.append(text("i", "", "dot " + (statusClass(provider) === "ready" ? "ready" : "warning")), document.createTextNode(statusLabel(provider)));
      top.append(name, state); card.append(top);
      const detail = provider.latest_job?.error || provider.detail || "Awaiting verification.";
      card.append(text("p", detail));
      const actions = document.createElement("div"); actions.className = "card-actions";
      const official = text("a", provider.authentication === "required" ? "Open sign-in ↗" : "Open provider ↗", "link-button");
      official.href = provider.url; official.target = "_blank"; official.rel = "noopener noreferrer";
      actions.append(official);
      if (provider.status === "disabled") {
        actions.append(button("Enable", "button secondary", () => providerAction(provider, "enable").catch(showError)));
      } else {
        const connect = button(provider.ready ? "Verify again" : "Connect", "button primary", () => providerAction(provider, "connect").catch(showError));
        connect.disabled = provider.latest_job?.status === "running"; actions.append(connect);
        actions.append(button("Disable", "button secondary", () => providerAction(provider, "disable").catch(showError)));
      }
      if (provider.latest_job?.status === "failed" || provider.latest_event?.level === "error") {
        actions.append(button("View error", "button secondary", () => openEvents(provider.id)));
      }
      card.append(actions); root.append(card);
    }
  }
  async function harnessAction(harness, action) {
    const result = await api("/v1/control/harnesses/" + encodeURIComponent(harness.id) + "/actions", { method: "POST", body: JSON.stringify({ action }) });
    if (result.configuration || result.token) {
      $("resultTitle").textContent = harness.label + " is ready";
      $("resultIntro").textContent = "Use this OpenAI-compatible connection in the client:";
      $("resultBody").textContent = JSON.stringify(result.configuration || { base_url: result.baseUrl, api_key: result.token, model: "relay-auto" }, null, 2);
      $("resultDialog").showModal();
    } else toast(action === "connect" ? harness.label + " connected." : harness.label + " disconnected.");
    await refresh();
  }
  function renderHarnesses(harnesses) {
    const root = $("harnessGrid"); root.replaceChildren();
    for (const harness of harnesses) {
      const card = document.createElement("article"); card.className = "harness-card";
      const info = document.createElement("div"); info.className = "harness-info";
      const badge = text("span", harness.connected ? "Connected" : harness.detected ? "Detected" : "Available", "harness-badge" + (harness.connected ? " connected" : ""));
      info.append(text("strong", harness.label), badge, text("span", harness.path || (harness.id === "generic" ? "Works with any OpenAI-compatible client" : "Configuration will be created on connect")));
      card.append(info, button(harness.connected ? "Disconnect" : "Connect", "button " + (harness.connected ? "secondary" : "primary"), () => harnessAction(harness, harness.connected ? "disconnect" : "connect").catch(showError)));
      root.append(card);
    }
  }
  function fillSelect(select, values, selected) {
    select.replaceChildren();
    for (const value of values) { const option = text("option", value); option.value = value; option.selected = value === selected; select.append(option); }
  }
  function renderRouting(data) {
    const routing = data.routing;
    $("routingEnabled").checked = routing.enabled; $("routingMode").value = routing.mode; $("routingPreset").value = routing.preset; $("allowFallbacks").checked = routing.allowFallbacks;
    const models = [...new Set(data.providers.flatMap((provider) => provider.models))];
    fillSelect($("manualModel"), models, routing.manualModel);
    fillSelect($("testModel"), ["relay-auto", ...models], "relay-auto");
    const choices = $("providerChoices"); choices.replaceChildren();
    const orderedProviders = [...data.providers].sort((a, b) => {
      const rank = (id) => { const index = routing.priorityProviders.indexOf(id); return index < 0 ? 999 : index; };
      return rank(a.id) - rank(b.id);
    });
    for (const provider of orderedProviders) {
      const row = document.createElement("div"); row.className = "choice-row";
      const label = document.createElement("label");
      const input = document.createElement("input"); input.type = "checkbox"; input.value = provider.id; input.checked = routing.selectedProviders.length === 0 || routing.selectedProviders.includes(provider.id);
      label.append(input, text("span", provider.label + (provider.ready ? " · ready" : "")));
      const order = document.createElement("span"); order.className = "choice-order";
      const up = button("↑", "order-button", () => { const previous = row.previousElementSibling; if (previous) choices.insertBefore(row, previous); });
      const down = button("↓", "order-button", () => { const next = row.nextElementSibling; if (next) choices.insertBefore(next, row); });
      up.title = "Move provider earlier"; down.title = "Move provider later";
      order.append(up, down); row.append(label, order); choices.append(row);
    }
  }
  async function saveRouting() {
    $("saveState").textContent = "Saving…";
    const selectedProviders = [...$("providerChoices").querySelectorAll("input:checked")].map((node) => node.value);
    await api("/v1/control/routing", { method: "PUT", body: JSON.stringify({ enabled: $("routingEnabled").checked, mode: $("routingMode").value, preset: $("routingPreset").value, manualModel: $("manualModel").value, selectedProviders, priorityProviders: selectedProviders, allowFallbacks: $("allowFallbacks").checked }) });
    $("saveState").textContent = "Saved"; toast("Routing policy saved."); await refresh();
  }
  function renderOverview(data) {
    overview = data; const ready = data.providers.filter((provider) => provider.ready).length; const connected = data.harnesses.filter((harness) => harness.connected).length;
    $("relayStatus").textContent = "Running"; $("relayDetail").textContent = "v" + data.relay.version + " · 127.0.0.1:" + data.relay.port;
    $("readyCount").textContent = String(ready); $("providerDetail").textContent = data.providers.length + " browser connectors installed";
    $("routingStatus").textContent = data.routing.enabled ? data.routing.mode : "Off"; $("routingDetail").textContent = data.routing.enabled ? data.routing.preset + " policy · relay-auto" : "Requests require a model";
      $("harnessCount").textContent = connected + " connected"; $("bridgeStatus").textContent = data.browser_bridge.connected ? "Connected" : data.browser_bridge.installed ? "Offline" : "Optional"; $("bridgeDetail").textContent = data.browser_bridge.detail;
      $("heroSummary").textContent = ready ? ready + " provider" + (ready === 1 ? "" : "s") + " verified and available for local requests." : "The relay is healthy. Connect a provider to enable browser-backed requests.";
    renderProviders(data.providers); renderHarnesses(data.harnesses); renderRouting(data);
  }
  async function refresh() {
    if (!token) return; $("pollState").textContent = "Refreshing…";
    try { renderOverview(await api("/v1/control/overview")); $("pollState").textContent = "Live · just now"; $("relayDot").style.background = "var(--mint)"; }
    catch (error) { $("pollState").textContent = "Connection issue"; $("relayDot").style.background = "var(--red)"; throw error; }
  }
  function showError(error) { toast(messageOf(error)); }
  async function openEvents(providerId) {
    const suffix = providerId ? "?provider_id=" + encodeURIComponent(providerId) : "";
    const result = await api("/v1/control/events" + suffix); const root = $("eventList"); root.replaceChildren();
    if (!result.data.length) root.append(text("p", "No activity recorded yet.", "quiet"));
    for (const event of result.data) {
      const card = document.createElement("article"); card.className = "event" + (event.level === "error" ? " error-event" : "");
      const head = document.createElement("div"); head.className = "event-head"; head.append(text("strong", event.message), text("time", new Date(event.timestamp).toLocaleString()));
      card.append(head); if (event.detail) card.append(text("p", event.detail)); root.append(card);
    }
    $("activityDialog").showModal();
  }
  async function unlock(event) {
    event.preventDefault(); token = $("token").value.trim(); $("unlockError").textContent = "";
    if (!token) { $("unlockError").textContent = "Enter the relay token."; return; }
    try {
      await refresh(); $("unlockView").hidden = true; $("appView").hidden = false; $("forgetToken").disabled = false; $("refresh").disabled = false;
      timer = setInterval(() => refresh().catch(() => {}), 5000);
    } catch (error) { token = ""; $("unlockError").textContent = messageOf(error); }
  }
  function lock() {
    token = ""; overview = null; clearInterval(timer); timer = null; $("token").value = ""; $("unlockView").hidden = false; $("appView").hidden = true; $("forgetToken").disabled = true; $("refresh").disabled = true; $("pollState").textContent = "Offline";
  }
  async function sendTest() {
    $("testOutput").textContent = "Waiting for the selected provider…";
    try {
      const result = await api("/v1/responses", { method: "POST", body: JSON.stringify({ model: $("testModel").value, input: $("testPrompt").value }) });
      $("testOutput").textContent = result.output_text || JSON.stringify(result, null, 2);
    } catch (error) { $("testOutput").textContent = messageOf(error); }
  }
  $("unlockForm").addEventListener("submit", unlock); $("forgetToken").addEventListener("click", lock); $("refresh").addEventListener("click", () => refresh().catch(showError));
  $("saveRouting").addEventListener("click", () => saveRouting().catch(showError)); $("openLogs").addEventListener("click", () => openEvents().catch(showError)); $("sendTest").addEventListener("click", sendTest);
  $("connectAvailable").addEventListener("click", async () => { for (const provider of (overview?.providers || []).filter((item) => item.authentication === "optional" && !item.ready)) await providerAction(provider, "connect"); });
  $("disconnectAll").addEventListener("click", async () => { if (!confirm("Disconnect every harness and revoke all relay-issued harness keys? Existing non-relay settings will remain.")) return; await api("/v1/control/harnesses/disconnect-all", { method: "POST", body: JSON.stringify({ confirm: true }) }); toast("All harness integrations removed."); await refresh(); });
  document.querySelectorAll(".close-dialog").forEach((node) => node.addEventListener("click", () => node.closest("dialog").close()));
})();`;
