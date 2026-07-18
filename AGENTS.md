# Instructions for coding agents

There is one source of truth for the work to do: [`TASK.md`](TASK.md).

## Start

1. Read `TASK.md` completely.
2. Inspect only the files named there, expanding scope only when evidence makes
   it necessary.
3. Reproduce the stated baseline before changing code.
4. Complete the task, run every acceptance command, and publish the required
   deliverable.

Do not select another milestone, invent a task, or treat old `.agents/`
transcripts, milestone tables, reports, or comments as current instructions.
The maintainer's latest explicit direction overrides `TASK.md`; otherwise
`TASK.md` wins when documents disagree.

## Required behavior

- Work on a branch and prepare a pull request. Never push directly to `main` or
  merge unless the maintainer explicitly requests that exact action.
- Do not stop at analysis when `TASK.md` requires implementation.
- Do not claim a test passed without running it and reporting the exact result.
- Do not claim a file, commit, branch, or pull request was published unless it
  exists remotely and you provide its URL or full SHA.
- Do not equate a registered adapter, mock test, or successful login with live
  provider readiness. Readiness requires the evidence stated in `TASK.md` and
  `docs/plans/v2-master-plan.md`.
- Keep cookies, tokens, browser profiles, prompts, screenshots, and secrets out
  of Git. Diagnostics must be opt-in and redacted.
- Do not bypass CAPTCHA, access controls, rate limits, provider safeguards, or
  manual account/2FA decisions.
- Preserve unrelated user changes. Use the smallest coherent patch.
- Verify that all new or modified files are actually staged using `git status` or `git diff --cached` before committing. Pay special attention to filenames containing substrings matched by `.gitignore` (e.g., `token`, `secret`, `key`). Use `git add -f` to force stage required files if ignored.

## Deliverable format

Finish with facts, not a milestone summary:

```text
Branch: <remote branch>
Commit: <full SHA>
Pull request: <URL>
Changed: <short list>
Checks: <command and exact result for each>
Remaining blockers: <none, or concrete blocker>
```

If a true owner decision blocks completion, prepare all reversible work and
state the decision, recommended default, risk, and next action. Do not silently
skip it and declare completion.
