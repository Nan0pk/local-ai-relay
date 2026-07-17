#!/usr/bin/env node

import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = resolve(dirname(SCRIPT_PATH), "../../../..");
const ROOT = resolve(process.env.AGENT_BUS_ROOT || DEFAULT_ROOT);
const STATE_PATH = resolve(ROOT, "docs/agent-bus/state.json");
const STATUS_PATH = resolve(ROOT, "docs/agent-bus/STATUS.md");

const STATUSES = new Set(["backlog", "ready", "claimed", "review", "blocked", "done"]);
const RISKS = new Set(["low", "medium", "high", "owner"]);
const MODEL_TIERS = new Set(["economy", "standard", "frontier"]);
const VERIFY_MODES = new Set(["self", "independent", "owner"]);
const EFFORTS = new Set(["S", "M", "L"]);
const COMMIT_RE = /^[0-9a-f]{7,40}$/i;

function fail(message) {
  throw new Error(message);
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function parseFlags(tokens) {
  const positional = [];
  const flags = new Map();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = tokens[index + 1];
    if (next === undefined || next.startsWith("--")) {
      flags.set(key, true);
      continue;
    }
    index += 1;
    if (flags.has(key)) {
      const previous = flags.get(key);
      flags.set(key, Array.isArray(previous) ? [...previous, next] : [previous, next]);
    } else {
      flags.set(key, next);
    }
  }
  return { positional, flags };
}

function flag(flags, name, { required = false, multiple = false } = {}) {
  const value = flags.get(name);
  if (required && (value === undefined || value === true || value === "")) {
    fail(`missing required --${name}`);
  }
  if (multiple) {
    if (value === undefined || value === true) return [];
    return Array.isArray(value) ? value : [value];
  }
  return Array.isArray(value) ? value.at(-1) : value;
}

async function loadState() {
  let text;
  try {
    text = await readFile(STATE_PATH, "utf8");
  } catch (error) {
    fail(`cannot read ${STATE_PATH}: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`invalid JSON in ${STATE_PATH}: ${error.message}`);
  }
}

async function atomicWrite(path, content) {
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, path);
}

async function saveState(state) {
  state.updated_at = nowIso();
  updateReadiness(state);
  const errors = validateState(state);
  if (errors.length > 0) fail(`refusing to save invalid state:\n- ${errors.join("\n- ")}`);
  await atomicWrite(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
  await atomicWrite(STATUS_PATH, renderStatus(state));
}

function taskMap(state) {
  return new Map(state.tasks.map((task) => [task.id, task]));
}

function getTask(state, id) {
  const task = state.tasks.find((candidate) => candidate.id === id);
  if (!task) fail(`unknown task ${id}`);
  return task;
}

function dependenciesDone(task, byId) {
  return task.depends_on.every((id) => byId.get(id)?.status === "done");
}

function leaseExpired(task, now = new Date()) {
  if (!task.claim?.lease_until) return true;
  const lease = new Date(task.claim.lease_until);
  return Number.isNaN(lease.getTime()) || lease <= now;
}

function updateReadiness(state) {
  const byId = taskMap(state);
  for (const task of state.tasks) {
    if (task.status === "backlog" && dependenciesDone(task, byId)) task.status = "ready";
    if (task.status === "ready" && !dependenciesDone(task, byId)) task.status = "backlog";
  }
}

export function actionableTasks(state, { tier } = {}) {
  const copy = structuredClone(state);
  updateReadiness(copy);
  const effortOrder = { S: 0, M: 1, L: 2 };
  return copy.tasks
    .filter((task) => task.status === "ready")
    .filter((task) => !tier || task.model_tier === tier)
    .sort((left, right) =>
      left.priority - right.priority ||
      effortOrder[left.effort] - effortOrder[right.effort] ||
      left.id.localeCompare(right.id),
    );
}

function hasDependencyCycle(state) {
  const byId = taskMap(state);
  const visiting = new Set();
  const visited = new Set();
  const walk = (id) => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of byId.get(id)?.depends_on || []) {
      if (walk(dependency)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return state.tasks.some((task) => walk(task.id));
}

export function validateState(state) {
  const errors = [];
  if (state?.schema_version !== 1) errors.push("schema_version must equal 1");
  if (!state?.project) errors.push("project is required");
  if (!state?.plan) errors.push("plan is required");
  if (!Array.isArray(state?.tasks) || state.tasks.length === 0) {
    errors.push("tasks must be a non-empty array");
    return errors;
  }

  const ids = new Set();
  for (const task of state.tasks) {
    const prefix = task?.id || "<missing-id>";
    if (!task?.id) errors.push("task id is required");
    else if (ids.has(task.id)) errors.push(`${task.id}: duplicate id`);
    else ids.add(task.id);
    if (!task?.title) errors.push(`${prefix}: title is required`);
    if (!Number.isInteger(task?.phase) || task.phase < 0) errors.push(`${prefix}: phase must be a non-negative integer`);
    if (!Number.isInteger(task?.priority)) errors.push(`${prefix}: priority must be an integer`);
    if (!STATUSES.has(task?.status)) errors.push(`${prefix}: invalid status ${task?.status}`);
    if (!RISKS.has(task?.risk)) errors.push(`${prefix}: invalid risk ${task?.risk}`);
    if (!MODEL_TIERS.has(task?.model_tier)) errors.push(`${prefix}: invalid model_tier ${task?.model_tier}`);
    if (!EFFORTS.has(task?.effort)) errors.push(`${prefix}: invalid effort ${task?.effort}`);
    if (!VERIFY_MODES.has(task?.verification)) errors.push(`${prefix}: invalid verification ${task?.verification}`);
    if (task?.risk === "high" && task?.verification !== "independent") {
      errors.push(`${prefix}: high-risk tasks require independent verification`);
    }
    if (task?.risk === "owner" && task?.verification !== "owner") {
      errors.push(`${prefix}: owner-risk tasks require owner verification`);
    }
    for (const key of ["depends_on", "context", "write_scope", "acceptance"]) {
      if (!Array.isArray(task?.[key])) errors.push(`${prefix}: ${key} must be an array`);
    }
    if (Array.isArray(task?.context) && task.context.length === 0) errors.push(`${prefix}: context cannot be empty`);
    if (Array.isArray(task?.write_scope) && task.write_scope.length === 0) errors.push(`${prefix}: write_scope cannot be empty`);
    if (Array.isArray(task?.acceptance) && task.acceptance.length === 0) errors.push(`${prefix}: acceptance cannot be empty`);
    if (task?.status === "claimed" && !task.claim) errors.push(`${prefix}: claimed status requires a claim`);
    if (task?.claim) {
      for (const key of ["agent", "branch", "started_at", "lease_until"]) {
        if (!task.claim[key]) errors.push(`${prefix}: claim.${key} is required`);
      }
    }
    if (["review", "done"].includes(task?.status) && !task.handoff) {
      errors.push(`${prefix}: ${task.status} status requires a handoff`);
    }
    if (task?.handoff && !COMMIT_RE.test(task.handoff.commit || "")) {
      errors.push(`${prefix}: handoff.commit must be a 7-40 character hexadecimal SHA`);
    }
    if (task?.status === "blocked" && !task.blocker?.reason) errors.push(`${prefix}: blocked status requires blocker.reason`);
    if (task?.status === "done" && task.verification === "independent") {
      if (task.verification_record?.result !== "pass") errors.push(`${prefix}: done high-risk task requires a passing verification`);
      if (task.verification_record?.commit !== task.handoff?.commit) errors.push(`${prefix}: verification commit must match handoff commit`);
      if (task.verification_record?.agent === task.handoff?.agent) errors.push(`${prefix}: independent verifier must differ from builder`);
    }
    if (task?.status === "done" && task.verification === "owner") {
      if (task.verification_record?.result !== "approved") errors.push(`${prefix}: owner task requires an approved verification`);
      if (task.verification_record?.commit !== task.handoff?.commit) errors.push(`${prefix}: owner approval commit must match handoff commit`);
    }
  }

  for (const task of state.tasks) {
    for (const dependency of task.depends_on || []) {
      if (!ids.has(dependency)) errors.push(`${task.id}: unknown dependency ${dependency}`);
      if (dependency === task.id) errors.push(`${task.id}: cannot depend on itself`);
    }
    if (task.status === "done") {
      for (const dependency of task.depends_on || []) {
        const target = state.tasks.find((candidate) => candidate.id === dependency);
        if (target?.status !== "done") errors.push(`${task.id}: done task has incomplete dependency ${dependency}`);
      }
    }
  }
  if (hasDependencyCycle(state)) errors.push("task dependency graph contains a cycle");
  return errors;
}

function phaseSummary(state) {
  const phases = new Map();
  for (const task of state.tasks) {
    if (!phases.has(task.phase)) phases.set(task.phase, { total: 0, done: 0, active: 0, blocked: 0 });
    const phase = phases.get(task.phase);
    phase.total += 1;
    if (task.status === "done") phase.done += 1;
    if (["claimed", "review"].includes(task.status)) phase.active += 1;
    if (task.status === "blocked") phase.blocked += 1;
  }
  return phases;
}

function markdownTable(headers, rows) {
  if (rows.length === 0) return "_None._\n";
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
    "",
  ].join("\n");
}

function normalizeLineEndings(text) {
  return text.replace(/\r\n/g, "\n");
}

export function renderStatus(state) {
  const copy = structuredClone(state);
  updateReadiness(copy);
  const ready = actionableTasks(copy).slice(0, 8);
  const active = copy.tasks.filter((task) => ["claimed", "review"].includes(task.status));
  const blocked = copy.tasks.filter((task) => task.status === "blocked");
  const phases = [...phaseSummary(copy).entries()].sort(([left], [right]) => left - right);
  const done = copy.tasks.filter((task) => task.status === "done").length;
  const next = ready[0];
  const lines = [
    "# Agent Bus Status",
    "",
    `**Project:** ${copy.project}  `,
    `**Updated:** ${copy.updated_at}  `,
    `**Progress:** ${done}/${copy.tasks.length} tasks complete  `,
    `**Next:** ${next ? `${next.id} — ${next.title}` : "No dependency-ready task"}`,
    "",
    "This file is generated from `state.json`. Do not edit it manually.",
    "",
    "## Phases",
    "",
    markdownTable(
      ["Phase", "Done", "Total", "Active", "Blocked"],
      phases.map(([number, value]) => [number, value.done, value.total, value.active, value.blocked]),
    ).trimEnd(),
    "",
    "## Ready work",
    "",
    markdownTable(
      ["Task", "Priority", "Tier", "Risk", "Effort", "Title"],
      ready.map((task) => [task.id, task.priority, task.model_tier, task.risk, task.effort, task.title]),
    ).trimEnd(),
    "",
    "## Active or awaiting review",
    "",
    markdownTable(
      ["Task", "State", "Agent", "Branch", "Lease / commit"],
      active.map((task) => [
        task.id,
        task.status,
        task.claim?.agent || task.handoff?.agent || "—",
        task.claim?.branch || "—",
        task.status === "claimed" ? task.claim?.lease_until || "—" : task.handoff?.commit || "—",
      ]),
    ).trimEnd(),
    "",
    "## Blocked",
    "",
    markdownTable(
      ["Task", "Agent", "Reason"],
      blocked.map((task) => [task.id, task.blocker?.agent || "—", task.blocker?.reason || "—"]),
    ).trimEnd(),
    "",
    "## Commands",
    "",
    "```bash",
    "npm run agent:next",
    "npm run agent:prompt",
    "npm run agent:check",
    "```",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function addHistory(task, action, agent, note, commit) {
  const item = { at: nowIso(), action, agent, note };
  if (commit) item.commit = commit;
  task.history = [...(task.history || []), item].slice(-12);
}

function describeTask(task) {
  const lines = [
    `${task.id} — ${task.title}`,
    `state=${task.status} phase=${task.phase} priority=${task.priority} effort=${task.effort}`,
    `model_tier=${task.model_tier} risk=${task.risk} verification=${task.verification}`,
    `depends_on=${task.depends_on.length ? task.depends_on.join(", ") : "none"}`,
    "",
    "Context:",
    ...task.context.map((item) => `- ${item}`),
    "",
    "Write scope:",
    ...task.write_scope.map((item) => `- ${item}`),
    "",
    "Acceptance:",
    ...task.acceptance.map((item) => `- ${item}`),
  ];
  if (task.claim) lines.push("", `Claim: ${task.claim.agent} on ${task.claim.branch} until ${task.claim.lease_until}`);
  if (task.handoff) lines.push("", `Handoff: ${task.handoff.agent} @ ${task.handoff.commit}`, ...task.handoff.evidence.map((item) => `- ${item}`));
  if (task.verification_record) lines.push("", `Verification: ${task.verification_record.result} by ${task.verification_record.agent} @ ${task.verification_record.commit}`);
  if (task.blocker) lines.push("", `Blocked: ${task.blocker.reason}`);
  return `${lines.join("\n")}\n`;
}

function promptForTask(task) {
  return [
    `Continue local-ai-relay v2 task ${task.id}: ${task.title}.`,
    "Follow AGENTS.md and .agents/skills/agent-bus/SKILL.md.",
    `Use the section headed \"### ${task.id}\" in docs/plans/v2-master-plan.md as the intent and acceptance source.`,
    `Start with only these files: ${task.context.join(", ")}.`,
    `Stay within this write scope: ${task.write_scope.join(", ")}.`,
    `Use at most the ${task.model_tier} model tier unless a compact failure packet justifies escalation.`,
    "Claim the task, implement the smallest complete change, run its acceptance checks, update the bus, and prepare a draft pull request.",
    "Do not ask me for implementation choices that the repository can resolve. Stop only for an owner-only decision or a concrete safety blocker.",
  ].join(" ");
}

async function commandValidate(flags) {
  const state = await loadState();
  const errors = validateState(state);
  if (flag(flags, "check-status")) {
    let current = "";
    try {
      current = await readFile(STATUS_PATH, "utf8");
    } catch (error) {
      errors.push(`cannot read generated STATUS.md: ${error.message}`);
    }
    if (current && normalizeLineEndings(current) !== renderStatus(state)) {
      errors.push("STATUS.md is stale; run: npm run agent:status -- --write");
    }
  }
  if (errors.length > 0) fail(`validation failed:\n- ${errors.join("\n- ")}`);
  console.log(`Agent bus valid: ${state.tasks.length} tasks, ${actionableTasks(state).length} ready.`);
}

async function commandNext(flags) {
  const state = await loadState();
  const errors = validateState(state);
  if (errors.length) fail(`state is invalid:\n- ${errors.join("\n- ")}`);
  const tier = flag(flags, "tier");
  if (tier && !MODEL_TIERS.has(tier)) fail(`invalid --tier ${tier}`);
  const tasks = actionableTasks(state, { tier });
  if (tasks.length === 0) fail("no dependency-ready task matches the request");
  console.log(describeTask(tasks[0]));
}

async function commandShow(id) {
  const state = await loadState();
  console.log(describeTask(getTask(state, id)));
}

async function commandPrompt(id) {
  const state = await loadState();
  const task = id ? getTask(state, id) : actionableTasks(state)[0];
  if (!task) fail("no dependency-ready task is available");
  console.log(promptForTask(task));
}

async function commandClaim(id, flags) {
  const state = await loadState();
  updateReadiness(state);
  const task = getTask(state, id);
  const agent = flag(flags, "agent", { required: true });
  const branch = flag(flags, "branch", { required: true });
  const hoursText = flag(flags, "hours") || "4";
  const hours = Number(hoursText);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) fail("--hours must be greater than 0 and at most 24");
  if (task.status === "claimed" && !leaseExpired(task)) fail(`${id} is claimed by ${task.claim.agent} until ${task.claim.lease_until}`);
  if (task.status === "claimed" && leaseExpired(task) && !flag(flags, "takeover")) fail(`${id} has an expired claim; inspect its branch and pass --takeover`);
  if (task.status !== "ready" && task.status !== "claimed") fail(`${id} is ${task.status}, not ready`);
  const start = new Date();
  task.status = "claimed";
  task.claim = {
    agent,
    branch,
    started_at: start.toISOString().replace(/\.\d{3}Z$/, "Z"),
    lease_until: new Date(start.getTime() + hours * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"),
  };
  task.blocker = null;
  addHistory(task, flag(flags, "takeover") ? "takeover" : "claim", agent, branch);
  await saveState(state);
  console.log(`Claimed ${id} for ${agent} on ${branch} until ${task.claim.lease_until}.`);
}

async function commandRenew(id, flags) {
  const state = await loadState();
  const task = getTask(state, id);
  const agent = flag(flags, "agent", { required: true });
  const hours = Number(flag(flags, "hours") || "4");
  if (task.status !== "claimed" || task.claim?.agent !== agent) fail(`${id} is not claimed by ${agent}`);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) fail("--hours must be greater than 0 and at most 24");
  task.claim.lease_until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
  addHistory(task, "renew", agent, `${hours}h`);
  await saveState(state);
  console.log(`Renewed ${id} until ${task.claim.lease_until}.`);
}

async function commandHandoff(id, flags) {
  const state = await loadState();
  const task = getTask(state, id);
  const agent = flag(flags, "agent", { required: true });
  const commit = flag(flags, "commit", { required: true });
  const evidence = flag(flags, "evidence", { multiple: true });
  if (task.status !== "claimed" || task.claim?.agent !== agent) fail(`${id} is not claimed by ${agent}`);
  if (!COMMIT_RE.test(commit)) fail("--commit must be a 7-40 character hexadecimal SHA");
  if (evidence.length === 0) fail("at least one --evidence item is required");
  task.status = "review";
  task.handoff = { agent, commit, at: nowIso(), evidence: [...new Set(evidence)] };
  task.verification_record = null;
  task.blocker = null;
  addHistory(task, "handoff", agent, evidence.join("; "), commit);
  await saveState(state);
  console.log(`Handed off ${id} at ${commit}.`);
}

async function commandVerify(id, flags) {
  const state = await loadState();
  const task = getTask(state, id);
  const agent = flag(flags, "agent", { required: true });
  const commit = flag(flags, "commit", { required: true });
  const result = flag(flags, "result", { required: true });
  const evidence = flag(flags, "evidence", { multiple: true });
  const allowed = task.verification === "owner" ? new Set(["approved", "rejected"]) : new Set(["pass", "fail"]);
  if (task.status !== "review") fail(`${id} is ${task.status}, not awaiting review`);
  if (!allowed.has(result)) fail(`--result must be one of: ${[...allowed].join(", ")}`);
  if (commit !== task.handoff?.commit) fail("verification commit must match the handoff commit");
  if (task.verification === "independent" && agent === task.handoff?.agent) fail("independent verifier must differ from builder");
  if (evidence.length === 0) fail("at least one --evidence item is required");
  task.verification_record = { agent, commit, result, at: nowIso(), evidence: [...new Set(evidence)] };
  if (["fail", "rejected"].includes(result)) {
    task.status = "blocked";
    task.blocker = { agent, at: nowIso(), reason: `verification ${result}: ${evidence.join("; ")}` };
  }
  addHistory(task, "verify", agent, `${result}: ${evidence.join("; ")}`, commit);
  await saveState(state);
  console.log(`Recorded ${result} verification for ${id} at ${commit}.`);
}

async function commandComplete(id, flags) {
  const state = await loadState();
  const task = getTask(state, id);
  const agent = flag(flags, "agent", { required: true });
  const commit = flag(flags, "commit", { required: true });
  if (task.status !== "review") fail(`${id} is ${task.status}, not awaiting completion`);
  if (commit !== task.handoff?.commit) fail("completion commit must match handoff commit");
  if (task.verification === "independent") {
    if (task.verification_record?.result !== "pass" || task.verification_record?.commit !== commit) fail("passing independent verification of the exact commit is required");
    if (task.verification_record.agent === task.handoff.agent) fail("independent verifier must differ from builder");
  }
  if (task.verification === "owner") {
    if (task.verification_record?.result !== "approved" || task.verification_record?.commit !== commit) fail("owner approval of the exact commit is required");
  }
  task.status = "done";
  task.claim = null;
  task.blocker = null;
  addHistory(task, "complete", agent, "acceptance satisfied", commit);
  await saveState(state);
  console.log(`Completed ${id} at ${commit}. Maintainer merge authority is unchanged.`);
}

async function commandBlock(id, flags) {
  const state = await loadState();
  const task = getTask(state, id);
  const agent = flag(flags, "agent", { required: true });
  const reason = flag(flags, "reason", { required: true });
  if (!["ready", "claimed", "review"].includes(task.status)) fail(`${id} cannot be blocked from ${task.status}`);
  if (task.claim && task.claim.agent !== agent && !leaseExpired(task)) fail(`${id} is claimed by ${task.claim.agent}`);
  task.status = "blocked";
  task.blocker = { agent, at: nowIso(), reason };
  addHistory(task, "block", agent, reason);
  await saveState(state);
  console.log(`Blocked ${id}: ${reason}`);
}

async function commandUnblock(id, flags) {
  const state = await loadState();
  const task = getTask(state, id);
  const agent = flag(flags, "agent", { required: true });
  const reason = flag(flags, "reason", { required: true });
  if (task.status !== "blocked") fail(`${id} is not blocked`);
  task.claim = null;
  task.handoff = null;
  task.verification_record = null;
  task.blocker = null;
  task.status = dependenciesDone(task, taskMap(state)) ? "ready" : "backlog";
  addHistory(task, "unblock", agent, reason);
  await saveState(state);
  console.log(`Unblocked ${id}; state is now ${task.status}.`);
}

async function commandRelease(id, flags) {
  const state = await loadState();
  const task = getTask(state, id);
  const agent = flag(flags, "agent", { required: true });
  const reason = flag(flags, "reason", { required: true });
  if (task.status !== "claimed") fail(`${id} is not claimed`);
  if (task.claim.agent !== agent && !leaseExpired(task)) fail(`${id} is claimed by ${task.claim.agent} until ${task.claim.lease_until}`);
  task.claim = null;
  task.status = dependenciesDone(task, taskMap(state)) ? "ready" : "backlog";
  addHistory(task, "release", agent, reason);
  await saveState(state);
  console.log(`Released ${id}; state is now ${task.status}.`);
}

async function commandStatus(flags) {
  const state = await loadState();
  const content = renderStatus(state);
  if (flag(flags, "write")) {
    await atomicWrite(STATUS_PATH, content);
    console.log(`Wrote ${STATUS_PATH}.`);
  } else {
    process.stdout.write(content);
  }
}

function usage() {
  return `Agent Bus

Usage:
  bus.mjs next [--tier economy|standard|frontier]
  bus.mjs show <TASK-ID>
  bus.mjs prompt [TASK-ID]
  bus.mjs claim <TASK-ID> --agent NAME --branch BRANCH [--hours 4] [--takeover]
  bus.mjs renew <TASK-ID> --agent NAME [--hours 4]
  bus.mjs handoff <TASK-ID> --agent NAME --commit SHA --evidence TEXT [...]
  bus.mjs verify <TASK-ID> --agent NAME --commit SHA --result RESULT --evidence TEXT [...]
  bus.mjs complete <TASK-ID> --agent NAME --commit SHA
  bus.mjs block <TASK-ID> --agent NAME --reason TEXT
  bus.mjs unblock <TASK-ID> --agent NAME --reason TEXT
  bus.mjs release <TASK-ID> --agent NAME --reason TEXT
  bus.mjs status [--write]
  bus.mjs validate [--check-status]
`;
}

export async function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const { positional, flags } = parseFlags(rest);
  const id = positional[0];
  switch (command) {
    case "next": return commandNext(flags);
    case "show": if (!id) fail("show requires TASK-ID"); return commandShow(id);
    case "prompt": return commandPrompt(id);
    case "claim": if (!id) fail("claim requires TASK-ID"); return commandClaim(id, flags);
    case "renew": if (!id) fail("renew requires TASK-ID"); return commandRenew(id, flags);
    case "handoff": if (!id) fail("handoff requires TASK-ID"); return commandHandoff(id, flags);
    case "verify": if (!id) fail("verify requires TASK-ID"); return commandVerify(id, flags);
    case "complete": if (!id) fail("complete requires TASK-ID"); return commandComplete(id, flags);
    case "block": if (!id) fail("block requires TASK-ID"); return commandBlock(id, flags);
    case "unblock": if (!id) fail("unblock requires TASK-ID"); return commandUnblock(id, flags);
    case "release": if (!id) fail("release requires TASK-ID"); return commandRelease(id, flags);
    case "status": return commandStatus(flags);
    case "validate": return commandValidate(flags);
    case "help":
    case "--help":
    case "-h":
    case undefined:
      process.stdout.write(usage());
      return;
    default:
      fail(`unknown command ${command}\n\n${usage()}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
