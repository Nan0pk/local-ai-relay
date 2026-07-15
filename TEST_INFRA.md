# E2E Test Infra: local-ai-relay

## Test Philosophy
- Opaque-box, requirement-driven. Exercises the HTTP endpoints (`/v1/chat/completions`, `/v1/models`) of the running relay server.
- Uses a mock browser sandbox mode (`RELAY_MOCK_BROWSER=true`) to run tests deterministically without external browser installations or network dependencies.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinatorial Testing + Real-World Workload Testing.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Chat Completion Routing & Models List | ORIGINAL_REQUEST R1 / AC | 5 | 5 | ✓ |
| 2 | Browser Session Management | ORIGINAL_REQUEST R2 | 5 | 5 | ✓ |
| 3 | Tool-calling Bridge | ORIGINAL_REQUEST R1 / R3 | 5 | 5 | ✓ |
| 4 | Login & SSO Automation | ORIGINAL_REQUEST R2 / AC | 5 | 5 | ✓ |
| 5 | Provider Specific completions | ORIGINAL_REQUEST R1 / AC | 5 | 5 | ✓ |

## Test Architecture
- **Test Runner**: Node.js built-in test runner (`node --import tsx --test`) running files in `tests/e2e/`.
- **Invocation**: `npm run test:e2e` (configured in `package.json`).
- **Pass/Fail Semantics**: The test suite exits with code 0 if all tests pass, and non-zero if any test fails.
- **Directory Layout**:
  - `tests/e2e/mock-browser.ts`: Custom mock browser sandbox for Playwright/Patchright.
  - `tests/e2e/e2e.test.ts`: Complete E2E test suite (60+ cases).
- **Test Case Format**: Each test launches the Fastify server on a random port, performs HTTP requests via `fetch`, and asserts the response status, headers, and JSON body.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Multiphase Code Debugger | F2 (Session), F3 (Tools) | High |
| 2 | SSO Recovery and Re-try Flow | F4 (SSO), F1 (Routing) | Medium |
| 3 | Real-world Tool Fallback | F3 (Tools), F1 (Routing) | Medium |
| 4 | Concurrent Multi-User Sessions | F2 (Session), F5 (Provider) | High |
| 5 | Robust Event-Stream (SSE) Chat | F1 (Routing), F2 (Session) | High |

## Coverage Thresholds
- Tier 1: 25 test cases (5 per feature)
- Tier 2: 25 test cases (5 per feature)
- Tier 3: 5 test cases (pairwise combinatorial)
- Tier 4: 5 test cases (real-world application scenarios)
- **Total Threshold**: 60 test cases
