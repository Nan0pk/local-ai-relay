# ChatGPT Adapter Evidence & Readiness (v0.1.0)

## Status Matrix

| Path | Status | Verification Command | Last Verified |
|---|---|---|---|
| Mock E2E | **PASS** | `npm test` | Automated CI |
| Live Fedora Proof | **PENDING** (Maintainer Session) | `npm run probe:chatgpt && npm run canary:chatgpt` | Manual Owner Action |
| Windows Proof | **PENDING** (Task U0-02) | `npm run service:start:windows` | Phase U0-02 |

---

## Live Fedora Verification Command Sequence

To execute the live Fedora proof on an authorized machine with Chrome and an active graphical session:

```bash
# 1. Install & build
npm ci && npm run build

# 2. Authenticate (Manual step: sign in, 2FA, CAPTCHA)
npm run login:chatgpt

# 3. Live Probe (Verify single-turn marker match)
npm run probe:chatgpt

# 4. Five-Mission Authenticated Canary
npm run canary:chatgpt
```

The canary performs five real submissions and records 24-hour readiness
evidence only when all five return the exact marker. It does not itself restart
the relay; cold-restart recovery remains a separate release gate.
