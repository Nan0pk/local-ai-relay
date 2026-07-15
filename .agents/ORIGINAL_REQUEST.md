# Original User Request

## 2026-07-15T19:03:49Z

# Teamwork Project Prompt — Draft
Status: Launched
Goal: Craft prompt → get user approval → delegate to teamwork_preview

Develop and complete the local-ai-relay project: a polished, local-first bridge connecting OpenAI-compatible clients to user-authenticated webchat providers via browser automation.
Working directory: `/home/victus/agy`
Integrity mode: development

The project goal is to make the user’s life easier and facilitating his important work 

## Requirements

### R1. Provider Completion
Finalize the implementation of the pending webchat providers (Claude, DeepSeek, Z.ai, MiniMax, Kimi, Qwen, Grok, Mistral, (trying to use Arena.ai modes called direct and agent mode could be interesting to use)). First do those that work without mandatory login, then do the login mandated ones. The agents should evaluate the current codebase to determine the best path to get them fully integrated and registered.

### R2. Ingenious Login Solution
Engineer a simple, out-of-the-box solution to handle logins across these providers. Currently, the project relies on manual browser logins which is problematic due to 2FA etc. The agent team must design and implement an unorthodox, highly efficient solution to bypass or automate these hurdles so the relay can seamlessly utilize free tiers with minimal to zero manual intervention. An idea is to find a single login that work on most providers to minimize effort by user, other options must be found and analyzed and compared for use.

### R3. Polishing and Robustness
Fix any existing bugs, review the code for efficiency, and polish the implementation. Do not waste resources; fail fast and build it right.

## Acceptance Criteria

### Verification
- [ ] An automated test or script demonstrates that a chat completion can be successfully retrieved from all configured providers without a human having to manually perform the login/2FA dance each time and for each provider.
- [ ] npm run probe:all (or equivalent test command) returns PASS for the newly implemented providers.
- [ ] All core tests (npm test, npm run build, npm run smoke:startup) pass successfully.
- [ ] The login solution is documented and proven to be reliable and economical.

## Follow-up — 2026-07-15T19:14:37Z

The user has explicitly requested to apply the `/caveman` and `/ponytail` directives across the entire project to economize token use. 

Apply to all orchestrators and workers:
1. Apply the **Ponytail** mindset: find the laziest solution that actually works. Use the simplest, shortest, most minimal path. Reach for the standard library before custom code, and avoid over-engineering or speculative abstractions.
2. Apply the **Caveman** mindset: be extremely concise in your reasoning, logs, and communication. Economize token use wherever possible without losing critical information.

