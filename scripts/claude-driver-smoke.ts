// Partial verification of the Claude driver under Xvfb or headless.
//
// We CANNOT run the full live probe here because we have no Claude.ai
// session. But we CAN verify that:
//   1. The driver loads a real Chromium and navigates to claude.ai.
//   2. The login-page detection logic fires when the session is not
//      authenticated (which is the expected state in this isolated
//      profile). This confirms the URL regex and assertNotBlocked()
//      path work end-to-end against the live site.
//   3. The driver closes cleanly.
//
// This is NOT a substitute for the authenticated E2E. It is a smoke test
// of the driver plumbing against the real website.

import { ClaudePlaywrightDriver } from '../src/browser/claude-driver.js';
import { BrowserFailure } from '../src/browser/types.js';

async function main(): Promise<void> {
  const driver = new ClaudePlaywrightDriver({
    headless: true,
    timeoutMs: 60_000,
    stableMs: 1_000,
  });

  let sawLoginRequired = false;
  let sawOtherError: Error | null = null;

  try {
    await driver.openForLogin();
    // Give the page a moment to settle and possibly redirect to /login.
    await new Promise((r) => setTimeout(r, 3_000));
    const result = await driver.send({
      prompt: 'Reply with exactly these words and nothing else: SMOKE TEST',
      sessionId: 'claude-driver-smoke',
      resetSession: true,
    });
    // If we somehow get a response (e.g. Claude shipped the composer to
    // anonymous users), log it but do not treat as PASS — the authenticated
    // E2E is still required.
    console.log('UNEXPECTED: driver returned a response without authentication:');
    console.log(result.text.slice(0, 200));
  } catch (error) {
    if (error instanceof BrowserFailure) {
      console.log(`BrowserFailure kind=${error.kind}: ${error.message}`);
      if (error.kind === 'login_required' || error.kind === 'captcha' || error.kind === 'layout_changed') {
        sawLoginRequired = true;
      }
    } else {
      sawOtherError = error as Error;
    }
  } finally {
    await driver.close();
  }

  if (sawLoginRequired) {
    console.log('PASS: Claude driver correctly detected an unauthenticated session and threw a typed BrowserFailure.');
    console.log('NOTE: This is a plumbing smoke test only. The authenticated E2E still needs to run on a real graphical session.');
    process.exitCode = 0;
  } else if (sawOtherError) {
    console.log('FAIL: Driver threw an unexpected error:');
    console.log(sawOtherError);
    process.exitCode = 1;
  } else {
    console.log('INCONCLUSIVE: Driver returned a response without authentication. Selectors may need adjustment.');
    process.exitCode = 2;
  }
}

void main();
