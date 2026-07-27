# Aggregate Dogfood & Fault Injection Report (Task U0-03)

## Summary Metrics

| Metric | Target Threshold | Measured Result | Status |
|---|---|---|---|
| **Relay Classification Correctness** | $\ge 95\%$ | **100%** (5/5 fault scenarios) | **PASS** |
| **User Availability** | $\ge 95\%$ | **100%** (mock & canary suite) | **PASS** |
| **Silent Fallbacks** | **0** | **0** | **PASS** |
| **Secret / Profile Leakage** | **0** | **0** | **PASS** |

---

## Fault Injection Scenario Matrix

| Injected Scenario | Simulated DOM / HTTP State | Expected Classification | Result |
|---|---|---|---|
| `captcha` | Cloudflare Security iframe | `captcha` | **PASS** |
| `quota_exhausted` | `"reached your message limit"` UI | `quota_exhausted` | **PASS** |
| `login_required` | `"Sign in to ChatGPT"` UI | `login_required` | **PASS** |
| `rate_limited` | HTTP 429 Too Many Requests | `rate_limited` | **PASS** |
| `network_cut` | Aborted socket connection | `network_cut` | **PASS** |

---

## Verification Command

To run the deterministic fault-injection harness:

```bash
node --import tsx --test src/cli/fault-injection.test.ts
```
