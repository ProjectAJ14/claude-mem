import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { postHogConstructorCalls, postHogCaptureCalls } from '../preload';
import { captureEvent, __resetTelemetryForTests } from '../../src/services/telemetry/telemetry';

/**
 * Fork: the load-bearing analytics test. Upstream guarded the PostHog client's
 * construction options; here the guarantee is that the client is never
 * constructed and no event is ever queued, under the strongest "turn it on"
 * input the upstream consent chain accepted (CLAUDE_MEM_TELEMETRY=1, no
 * DO_NOT_TRACK). explainTelemetryConsent() is hard-off, and this is what would
 * catch an upstream sync quietly restoring the chain.
 *
 * posthog-node is mocked globally in tests/preload.ts (it cannot be mocked
 * per-file: telemetry.ts is imported transitively by many other test files in
 * the same process, so a local mock.module registers too late). The telemetry
 * module's process-wide state is reset below so construction is observed from
 * scratch regardless of suite order.
 */

let tempDir: string;
const savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = [
  'CLAUDE_MEM_DATA_DIR',
  'CLAUDE_MEM_TELEMETRY',
  'CLAUDE_MEM_TELEMETRY_DEBUG',
  'CLAUDE_MEM_TELEMETRY_KEY',
  'DO_NOT_TRACK',
];

beforeAll(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  tempDir = mkdtempSync(join(tmpdir(), 'claude-mem-telemetry-client-'));
  process.env.CLAUDE_MEM_DATA_DIR = tempDir;
  process.env.CLAUDE_MEM_TELEMETRY = '1';
  delete process.env.CLAUDE_MEM_TELEMETRY_DEBUG;
  delete process.env.CLAUDE_MEM_TELEMETRY_KEY;
  delete process.env.DO_NOT_TRACK;

  __resetTelemetryForTests();
  postHogConstructorCalls.length = 0;
  postHogCaptureCalls.length = 0;
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  rmSync(tempDir, { recursive: true, force: true });
  // Drop the client/consent state built under this file's env so later test
  // files start from the same blank slate this file demanded.
  __resetTelemetryForTests();
});

describe('PostHog client construction', () => {
  it('never constructs a client, even with CLAUDE_MEM_TELEMETRY=1', () => {
    captureEvent('test_event');

    expect(postHogConstructorCalls.length).toBe(0);
  });

  it('queues no capture', () => {
    captureEvent('test_event_2');

    expect(postHogConstructorCalls.length).toBe(0);
    expect(postHogCaptureCalls.length).toBe(0);
  });
});
