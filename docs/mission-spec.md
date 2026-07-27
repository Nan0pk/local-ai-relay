# Canary Mission Specification (v0)

This document defines the specification for live and synthetic **canary missions** in **Local AI Relay**.

---

## 1. Overview

A **mission** is a single scripted verification run against a provider adapter to validate live readiness, streaming integrity, tool execution, restart resilience, and idempotency ledger compliance.

---

## 2. Synthetic Corpus Requirements

All prompts used in canary missions must use synthetic, non-sensitive test data:

1. **Short Prompt (< 200 chars):**
   `"Respond with the single word ORANGE."`
2. **Long Prompt (~ 8k chars):**
   Synthetic structured payload containing repetitive verification text and requesting token extraction at the end.
3. **Multi-Turn Pair:**
   - Turn 1: `"Remember the secret code ALPHA-99."`
   - Turn 2: `"What was the secret code I gave you?"` (Expect: `"ALPHA-99"`)
4. **Streaming Assertion Prompt:**
   `"Count from 1 to 5 slowly."` (Requires $\ge 2$ SSE chunks and monotonic growth).
5. **Cancellation Prompt:**
   Long-running generation prompt cancelled 500ms after submission.
6. **Disposable Tool Fixture:**
   Read-only tool proposal (`get_current_time` or `echo_fixture`) with strict user approval gate.

---

## 3. Predicates and Assertions

- **Completion Predicate:** The prompt requests a specific canary token (e.g. `"ORANGE"`). The mission passes if and only if the exact token is observed via DOM selector or streamed events.
- **Streaming Monotonicity Assertion:** Streamed response chunks must satisfy $|C_i| > 0$ and $C_{\text{full}}(i) = C_{\text{full}}(i-1) + C_i$.
- **No-Duplicate Assertion:** The SQLite Idempotency Ledger must confirm exactly one `SUBMITTED` entry per `request_id` and at most one execution per `tool_call_id`.

---

## 4. Consecutive-Count & Promotion Rules

- **Live Promotion Requirement:** **5 consecutive canary missions** must succeed post-restart.
- **Classification Handling:** Correctly classified external conditions (`login_required`, `challenge`, `quota_exhausted`) **do not** increment the success counter, but **do not** reset it to zero.
- **Misclassification & Duplicate Penalties:** Any misclassified failure or duplicate prompt/tool submission **resets the consecutive success counter to 0**.

---

## 5. Evidence & Privacy Invariants

- Mission logs are strictly sanitized before persistence.
- **Forbidden in evidence:** Prompt text, response text, bearer tokens, cookies, user profile paths, and unredacted screenshots.
- **Permitted in evidence:** Timestamp, provider ID, model ID, test ID, failure classification class, timing breakdown (ms), and pass/fail boolean assertions.
