# Centralized Retry Policy Specification (v0)

> Proposed policy for the future ledger-backed execution path. The current HTTP
> routes do not yet persist request state or perform these retries.

This document defines the central retry policy for **Local AI Relay**. This policy is binding for all tasks, adapters, and execution phases.

---

## 1. Retry Invariants

- **Maximum Attempts:** At most **3 attempts** per external failure class.
- **Backoff Interval:** `1s` (attempt 1), `4s` (attempt 2), `15s` (attempt 3).
- **Jitter:** **±20%** pseudo-random jitter applied to each backoff interval.
- **Per-Mission Total Deadline:** **120 seconds** maximum execution wall-clock time unless explicitly overridden by task contract.
- **Immediate Cancellation:** Any cancellation signal (client abort, server shutdown, task timeout) immediately terminates the retry loop without further attempts.

---

## 2. Failure Class Taxonomy

| Failure Class | Retryable? | Action on Expiry / Non-retryable |
|---|---|---|
| `network_timeout` | Yes (max 3) | Mark request `FAILED(network_timeout)`, return `504 Gateway Timeout` |
| `browser_crash` | Yes (max 3) | Re-initialize browser context, resume observation |
| `rate_limited` | Yes (max 3 with backoff) | Mark request `FAILED(rate_limited)` |
| `login_required` | No | Halt retry, set status `login_required`, surface actionable auth instruction |
| `challenge` / `captcha` | No | Halt retry, set status `challenge`, surface manual verification requirement |
| `quota_exhausted` | No | Halt retry, set status `quota_exhausted` |
| `layout_change` | No | Halt retry, set status `layout_change` |

---

## 3. Backoff Schedule Calculation

For attempt index $k \in \{1, 2, 3\}$:
$$\text{BaseBackoff}(k) = \begin{cases} 1000\,\text{ms} & k=1 \\ 4000\,\text{ms} & k=2 \\ 15000\,\text{ms} & k=3 \end{cases}$$

$$\text{JitteredBackoff}(k) = \text{BaseBackoff}(k) \times (1 + r), \quad r \sim U(-0.20, +0.20)$$

---

## 4. Cancellation Propagation

1. **Client Disconnect:** If an SSE streaming HTTP connection closes, the adapter immediately halts polling and cancels outstanding browser actions.
2. **Ledger Integrity:** A cancelled request transitions to state `CANCELLED` in the SQLite Idempotency Ledger. No further retries or tool executions are permitted under a cancelled request ID.
