import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { resolveDataDir } from '../../shared/paths.js';
import { readJsonSafe } from '../../utils/json-utils.js';
import { logger } from '../../utils/logger.js';

export type TelemetryConfig = {
  /** Explicit user decision. Absent = no decision recorded; the opt-out default applies. */
  enabled?: boolean;
  installId: string;
  decidedAt: string;
};

const TELEMETRY_CONFIG_FILENAME = 'telemetry.json';

/** Which layer of the precedence chain decided the consent outcome. */
export type TelemetryConsentSource = 'DO_NOT_TRACK' | 'env' | 'config' | 'default';

export type TelemetryConsentExplanation = {
  enabled: boolean;
  source: TelemetryConsentSource;
};

/**
 * Resolves whether telemetry is allowed AND which layer decided it.
 * Pure function — no I/O.
 *
 * Fork: analytics are off unconditionally, and nothing can turn them back on
 * — not telemetry.json, not CLAUDE_MEM_TELEMETRY=1. Upstream's chain was
 * DO_NOT_TRACK > CLAUDE_MEM_TELEMETRY > telemetry.json > default-on (opt-out).
 *
 * This is the one place every send path resolves consent through
 * (telemetry.ts's hasConsent cache, cli-telemetry.ts, backfill.ts), so a
 * `false` here means no PostHog client is ever constructed and no event is
 * ever queued. The posthog-node dependency and the event-building code are
 * left in the tree unused: deleting them would conflict with every upstream
 * sync without changing what leaves the machine.
 */
export function explainTelemetryConsent(
  _env: NodeJS.ProcessEnv,
  _config: TelemetryConfig | null
): TelemetryConsentExplanation {
  return { enabled: false, source: 'default' };
}

/**
 * Resolves whether telemetry is allowed. Pure function — no I/O.
 * Thin wrapper over explainTelemetryConsent.
 */
export function resolveTelemetryConsent(
  env: NodeJS.ProcessEnv,
  config: TelemetryConfig | null
): boolean {
  return explainTelemetryConsent(env, config).enabled;
}

/**
 * Error-tracking kill-switch, INDEPENDENT of the analytics consent chain above.
 *
 * `CLAUDE_MEM_TELEMETRY_ERRORS=0` (or 'false'/'off') disables real exception
 * capture ($exception with redacted message/stack) WITHOUT touching analytics:
 * an operator who is fine with anonymous counters but not error text can opt out
 * of just the error path. Defaults ON whenever telemetry consent is on — error
 * capture is always additionally gated by the normal consent chain upstream, so
 * "consent off" already implies "no errors". Pure — no I/O.
 */
export function isErrorTelemetryEnabled(env: NodeJS.ProcessEnv): boolean {
  const value = env.CLAUDE_MEM_TELEMETRY_ERRORS?.toLowerCase();
  if (value === '0' || value === 'false' || value === 'off') return false;
  return true;
}

/** Absolute path of telemetry.json inside the claude-mem data dir. */
export function getTelemetryConfigPath(): string {
  return join(resolveDataDir(), TELEMETRY_CONFIG_FILENAME);
}

/**
 * Reads telemetry.json from the data dir. Returns null if the file is
 * missing, corrupt, or malformed — never throws.
 */
export function loadTelemetryConfig(): TelemetryConfig | null {
  let raw: Partial<TelemetryConfig> | null;
  try {
    raw = readJsonSafe<Partial<TelemetryConfig> | null>(getTelemetryConfigPath(), null);
  } catch (error) {
    // Corrupt JSON — treat as no recorded consent
    const err = error instanceof Error ? error : new Error(String(error));
    logger.warn('SYSTEM', 'Telemetry: corrupt telemetry.json; treating as no recorded consent', undefined, err);
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.installId !== 'string') return null;
  // enabled may be absent (no decision recorded — default applies), but a
  // present non-boolean value means the file is malformed.
  if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean') return null;
  return {
    enabled: raw.enabled,
    installId: raw.installId,
    decidedAt: typeof raw.decidedAt === 'string' ? raw.decidedAt : '',
  };
}

export function saveTelemetryConfig(config: TelemetryConfig): void {
  const dataDir = resolveDataDir();
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, TELEMETRY_CONFIG_FILENAME), JSON.stringify(config, null, 2) + '\n');
}

/**
 * Returns the stable anonymous install ID, generating and persisting one on
 * first use. Records ONLY the ID — never a consent decision — so the opt-out
 * default (and any future default change) still applies to this install.
 */
export function getOrCreateInstallId(): string {
  const existing = loadTelemetryConfig();
  if (existing?.installId) return existing.installId;

  const installId = randomUUID();
  saveTelemetryConfig({
    installId,
    decidedAt: '',
  });
  return installId;
}
