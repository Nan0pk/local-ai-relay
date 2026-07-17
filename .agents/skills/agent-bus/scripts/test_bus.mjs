#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { actionableTasks, renderStatus, validateState } from "./bus.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../../..");
const BUS = path.resolve(SCRIPT_DIR, "bus.mjs");
const SOURCE_STATE = path.resolve(REPO_ROOT, "docs/agent-bus/state.json");

async function readSourceState() {
  return JSON.parse(await readFile(SOURCE_STATE, "utf8"));
}

test("seed ledger is valid and selects the highest-priority ready task", async () => {
  const state = await readSourceState();
  assert.deepEqual(validateState(state), []);
  const actionable = actionableTasks(state);
  assert.ok(actionable.length > 0, "should have actionable tasks");
  const nextTaskId = actionable[0].id;
  assert.match(renderStatus(state), new RegExp(`Next:\\s+${nextTaskId}`));
});

test("README, repository instructions, skill, and master plan expose the one-prompt workflow", async () => {
  const state = await readSourceState();
  const [readme, agents, skill, plan] = await Promise.all([
    readFile(path.resolve(REPO_ROOT, "README.md"), "utf8"),
    readFile(path.resolve(REPO_ROOT, "AGENTS.md"), "utf8"),
    readFile(path.resolve(REPO_ROOT, ".agents/skills/agent-bus/SKILL.md"), "utf8"),
    readFile(path.resolve(REPO_ROOT, state.plan), "utf8"),
  ]);
  for (const required of ["One-prompt project execution", "npm run agent:prompt", "v2-master-plan.md", "agent-bus"]) {
    assert.ok(readme.includes(required), `README is missing ${required}`);
  }
  assert.ok(agents.includes("agent-bus/SKILL.md"));
  assert.ok(skill.includes("model_tier"));
  for (const task of state.tasks) {
    assert.ok(plan.includes(`### ${task.id} `), `master plan is missing heading ${task.id}`);
  }
});

test("validator rejects dependency cycles", async () => {
  const state = await readSourceState();
  state.tasks.find((task) => task.id === "P0-01").depends_on = ["P5-02"];
  assert.ok(validateState(state).some((message) => message.includes("cycle")));
});

test("validator rejects a completed high-risk task without independent proof", async () => {
  const state = await readSourceState();
  const task = state.tasks.find((candidate) => candidate.id === "P0-01");
  task.status = "done";
  task.handoff = { agent: "builder", commit: "abcdef1", at: "2026-07-17T00:00:00Z", evidence: ["tests pass"] };
  assert.ok(validateState(state).some((message) => message.includes("passing verification")));
});

test("CLI enforces claim, exact-commit verification, and generated status end to end", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "relay-agent-bus-"));
  const ledgerDir = path.join(root, "docs", "agent-bus");
  await mkdir(ledgerDir, { recursive: true });
  
  const state = JSON.parse(await readFile(SOURCE_STATE, "utf8"));
  const p001 = state.tasks.find((task) => task.id === "P0-01");
  if (p001) {
    p001.status = "ready";
    p001.claim = null;
    p001.handoff = null;
    p001.verification_record = null;
  }
  await writeFile(path.join(ledgerDir, "state.json"), JSON.stringify(state, null, 2), "utf8");

  const run = (...args) => spawnSync(process.execPath, [BUS, ...args], {
    cwd: root,
    env: { ...process.env, AGENT_BUS_ROOT: root },
    encoding: "utf8",
  });

  let result = run("claim", "P0-01", "--agent", "builder", "--branch", "fix/p0-01");
  assert.equal(result.status, 0, result.stderr);

  result = run(
    "handoff", "P0-01", "--agent", "builder", "--commit", "abcdef1",
    "--evidence", "npm test: pass", "--evidence", "npm run test:e2e: pass",
  );
  assert.equal(result.status, 0, result.stderr);

  result = run("complete", "P0-01", "--agent", "builder", "--commit", "abcdef1");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /independent verification/);

  result = run(
    "verify", "P0-01", "--agent", "builder", "--commit", "abcdef1",
    "--result", "pass", "--evidence", "reviewed",
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must differ from builder/);

  result = run(
    "verify", "P0-01", "--agent", "verifier", "--commit", "abcdef1",
    "--result", "pass", "--evidence", "adversarial checks: pass",
  );
  assert.equal(result.status, 0, result.stderr);

  result = run("complete", "P0-01", "--agent", "builder", "--commit", "abcdef1");
  assert.equal(result.status, 0, result.stderr);

  result = run("validate", "--check-status");
  assert.equal(result.status, 0, result.stderr);

  const statusPath = path.join(ledgerDir, "STATUS.md");
  const lfStatus = await readFile(statusPath, "utf8");
  await writeFile(statusPath, lfStatus.replace(/\n/g, "\r\n"), "utf8");
  result = run("validate", "--check-status");
  assert.equal(result.status, 0, result.stderr);

  const state = JSON.parse(await readFile(path.join(ledgerDir, "state.json"), "utf8"));
  assert.equal(state.tasks.find((task) => task.id === "P0-01").status, "done");
  assert.equal(state.tasks.find((task) => task.id === "P1-01").status, "backlog");
  const status = await readFile(statusPath, "utf8");
  assert.match(status, new RegExp(`1/${state.tasks.length} tasks complete`));
});
