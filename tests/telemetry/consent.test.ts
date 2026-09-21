import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  resolveTelemetryConsent,
  explainTelemetryConsent,
  loadTelemetryConfig,
  saveTelemetryConfig,
  getOrCreateInstallId,
  type TelemetryConfig,
} from '../../src/services/telemetry/consent';

const enabledConfig: TelemetryConfig = {
  enabled: true,
  installId: '00000000-0000-4000-8000-000000000000',
  decidedAt: '2026-06-09T00:00:00.000Z',
};

const disabledConfig: TelemetryConfig = {
  enabled: false,
  installId: '00000000-0000-4000-8000-000000000001',
  decidedAt: '2026-06-09T00:00:00.000Z',
};

// Fork: analytics are removed, so consent is not a chain any more — it is a
// constant. These cases are exactly the inputs upstream's precedence chain
// treated as "on" (default with no config, CLAUDE_MEM_TELEMETRY=1/true/on, a
// config with enabled=true, and any combination of them). Each one must still
// resolve to disabled, because a sync that restored the chain would otherwise
// re-enable PostHog silently.
describe('telemetry consent is hard-off', () => {
  const enablingInputs: Array<[string, NodeJS.ProcessEnv, TelemetryConfig | null]> = [
    ['no env, no config (upstream default-on)', {}, null],
    ['CLAUDE_MEM_TELEMETRY=1', { CLAUDE_MEM_TELEMETRY: '1' }, null],
    ['CLAUDE_MEM_TELEMETRY=true', { CLAUDE_MEM_TELEMETRY: 'true' }, null],
    ['CLAUDE_MEM_TELEMETRY=ON (case-insensitive upstream)', { CLAUDE_MEM_TELEMETRY: 'ON' }, null],
    ['a config recording enabled=true', {}, enabledConfig],
    ['an enabling env over a disabled config', { CLAUDE_MEM_TELEMETRY: '1' }, disabledConfig],
    ['DO_NOT_TRACK explicitly switched off', { DO_NOT_TRACK: '0' }, enabledConfig],
    ['a config with no decision recorded', {}, { installId: 'x', decidedAt: '' }],
  ];

  for (const [label, env, config] of enablingInputs) {
    it(`resolves off: ${label}`, () => {
      expect(resolveTelemetryConsent(env, config)).toBe(false);
      expect(explainTelemetryConsent(env, config)).toEqual({ enabled: false, source: 'default' });
    });
  }
});

describe('telemetry config persistence', () => {
  let tempDir: string;
  let previousDataDir: string | undefined;

  beforeEach(() => {
    tempDir = join(tmpdir(), `telemetry-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
    previousDataDir = process.env.CLAUDE_MEM_DATA_DIR;
    process.env.CLAUDE_MEM_DATA_DIR = tempDir;
  });

  afterEach(() => {
    if (previousDataDir === undefined) {
      delete process.env.CLAUDE_MEM_DATA_DIR;
    } else {
      process.env.CLAUDE_MEM_DATA_DIR = previousDataDir;
    }
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('loadTelemetryConfig', () => {
    it('returns null when telemetry.json does not exist', () => {
      expect(loadTelemetryConfig()).toBeNull();
    });

    it('returns null for corrupt JSON without throwing', () => {
      writeFileSync(join(tempDir, 'telemetry.json'), 'not valid json {{{');

      expect(loadTelemetryConfig()).toBeNull();
    });

    it('returns null for malformed shapes', () => {
      writeFileSync(
        join(tempDir, 'telemetry.json'),
        JSON.stringify({ enabled: 'yes', installId: 'abc' })
      );
      expect(loadTelemetryConfig()).toBeNull();

      writeFileSync(join(tempDir, 'telemetry.json'), JSON.stringify([1, 2, 3]));
      expect(loadTelemetryConfig()).toBeNull();
    });

    it('loads an installId-only config with enabled left undecided', () => {
      writeFileSync(join(tempDir, 'telemetry.json'), JSON.stringify({ installId: 'abc' }));

      const config = loadTelemetryConfig();
      expect(config?.installId).toBe('abc');
      expect(config?.enabled).toBeUndefined();
    });

    it('round-trips a saved config', () => {
      saveTelemetryConfig(enabledConfig);

      expect(loadTelemetryConfig()).toEqual(enabledConfig);
    });
  });

  describe('saveTelemetryConfig', () => {
    it('creates the data dir if missing', () => {
      const nestedDir = join(tempDir, 'nested', 'data-dir');
      process.env.CLAUDE_MEM_DATA_DIR = nestedDir;

      saveTelemetryConfig(disabledConfig);

      expect(existsSync(join(nestedDir, 'telemetry.json'))).toBe(true);
    });

    it('writes pretty-printed JSON', () => {
      saveTelemetryConfig(disabledConfig);

      const raw = readFileSync(join(tempDir, 'telemetry.json'), 'utf-8');
      expect(raw).toContain('\n  "enabled": false');
    });
  });

  describe('getOrCreateInstallId', () => {
    it('generates a UUID and persists it WITHOUT recording a consent decision', () => {
      const id = getOrCreateInstallId();

      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      const config = loadTelemetryConfig();
      expect(config?.installId).toBe(id);
      expect(config?.enabled).toBeUndefined();
      // Fork: the ID bootstrap cannot turn analytics on either.
      expect(explainTelemetryConsent({}, config)).toEqual({ enabled: false, source: 'default' });
    });

    it('returns the existing install ID on subsequent calls', () => {
      const first = getOrCreateInstallId();
      const second = getOrCreateInstallId();

      expect(second).toBe(first);
    });

    it('preserves enabled state from an existing config', () => {
      saveTelemetryConfig(enabledConfig);

      const id = getOrCreateInstallId();

      expect(id).toBe(enabledConfig.installId);
      expect(loadTelemetryConfig()?.enabled).toBe(true);
    });
  });
});
