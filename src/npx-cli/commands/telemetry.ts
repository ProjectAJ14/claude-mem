/**
 * `npx claude-mem telemetry [status|enable|disable]` — upstream's control
 * surface for anonymous usage analytics.
 *
 * Fork: analytics are removed. explainTelemetryConsent() returns false
 * unconditionally, so `status` always reports DISABLED and `enable` refuses
 * rather than writing a config that would not be honored. `disable` is kept
 * so anyone scripting it still gets a success, and so a telemetry.json left
 * over from an upstream install gets its opt-out recorded.
 */

import * as p from '@clack/prompts';
import { styleText } from 'node:util';
import {
  explainTelemetryConsent,
  loadTelemetryConfig,
  saveTelemetryConfig,
  getOrCreateInstallId,
  getTelemetryConfigPath,
  type TelemetryConsentSource,
} from '../../services/telemetry/consent.js';

const DOCS_URL = 'https://docs.claude-mem.ai/telemetry';

const COLLECTED_FIELDS = [
  'version          claude-mem version (e.g. 13.4.2)',
  'os               platform (darwin / linux / win32)',
  'os_version       OS kernel release (e.g. 10.0.22631)',
  'is_wsl           whether running under WSL',
  'arch             CPU architecture (arm64 / x64)',
  'runtime          bun or node',
  'runtime_version  runtime version string',
  'node_version     Node.js version string',
  'duration_ms      how long an operation took',
  'outcome          ok / error / partial / invalid_output / aborted',
  'error_category   coarse error bucket (never a message)',
  'locale           language tag (e.g. en-US)',
  'is_ci            whether running in CI',
  'endpoint         which claude-mem search route (our route names)',
  'ide              installer IDE choice (claude-code / cursor / ...)',
  'provider         LLM provider choice (claude / gemini / openrouter)',
  'runtime_mode     worker or server',
  'trigger          start or heartbeat',
  'count            integer volume (e.g. observations stored)',
  'has_summary      whether a compression produced a summary',
  'is_update        whether an install was an update',
  'interactive      whether the installer ran in a TTY',
  'install_method   npm / bun / pnpm / yarn (launcher of the CLI)',
  'bun_version / uv_version / claude_code_version',
  '                 toolchain versions detected during install',
  'mode             active claude-mem mode id',
  'model            model id used for compression',
  'hook             compression trigger (init / ingest / summarize)',
  'observation_type / obs_type_*   observation type buckets (counts only)',
  'compression_ms / tokens_input / tokens_output / compression_ratio',
  '                 latency + real token usage of one compression call',
  'cost_usd         provider-reported cost of one compression call (USD)',
  'endpoint_class   openrouter.ai vs custom gateway (enum)',
  'observation_count / session_count / timeline_depth_days / has_session_summary',
  '                 depth of one context injection',
  'tokens_injected / tokens_saved_vs_naive / search_strategy',
  '                 token economics of one context injection',
  'db_observation_count / db_session_count / db_summary_count / db_project_count',
  '                 total rows in your local memory DB (counts only)',
  'db_size_mb       memory database file size in MB',
  'install_age_days / days_since_last_obs / obs_count_7d / obs_count_30d',
  '                 install age and recent activity, in days/counts',
  'result_count     how many results a search returned (never the query)',
  'chroma_available whether vector search was reachable for a search',
  'fallback_reason  none / chroma_connection / chroma_error / chroma_not_initialized',
  'invalid_output_class   xml / idle / prose (never the output)',
  'consecutive_invalid_outputs   legacy unusable-output counter',
  'respawn_triggered      legacy recovery flag for old invalid-output restarts',
  'abort_reason     idle / shutdown / overflow / restart_guard / quota / provider_switch / none',
  'previous_shutdown      crash / clean / unknown (detected at worker start)',
  'previous_uptime_seconds / uptime_seconds',
  '                 worker uptime in whole seconds (previous run / at stop)',
  'shutdown_reason  stop / restart / signal',
  'process_rss_mb / heap_used_mb   worker memory, integer megabytes',
  'hook_type        context / session-init / observation / summarize / session-end / file-context',
  'error_mode       worker_unavailable / blocking_error (never a message)',
  'consecutive_failures   hook failures in a row (the fail-loud counter)',
  'threshold_tripped      whether the fail-loud threshold was reached',
  'skill_id         first-party plugin/skills name or other (never a third-party name)',
  'skill_source     first_party / third_party',
  'skill_trigger    tool (Skill tool) / prompt (typed /skill)',
];

const EVENT_NAMES = [
  'install_completed',
  'install_failed',
  'uninstall_completed',
  'worker_started',
  'worker_stopped',
  'session_compressed',
  'context_injected',
  'search_performed',
  'skill_invoked',
  'hook_failed',
  'error_occurred',
];

const SOURCE_LABELS: Record<TelemetryConsentSource, string> = {
  DO_NOT_TRACK: 'DO_NOT_TRACK environment variable',
  env: 'CLAUDE_MEM_TELEMETRY environment variable',
  config: 'telemetry.json config file',
  default: 'this fork (analytics removed — cannot be enabled)',
};

function printTelemetryUsage(): void {
  console.error(`Usage: ${styleText('bold', 'npx claude-mem telemetry [status|enable|disable]')}`);
  console.error('  status   Show whether telemetry is on and which setting decided it (default)');
  console.error('  enable   Refused — analytics are removed in this fork');
  console.error('  disable  Opt out of telemetry');
  console.error(`Docs: ${DOCS_URL}`);
}

function runTelemetryStatus(): void {
  // Status is read-only: it must never create telemetry.json as a side effect.
  const config = loadTelemetryConfig();
  const { enabled, source } = explainTelemetryConsent(process.env, config);

  const state = enabled ? styleText('green', 'ENABLED') : styleText('yellow', 'DISABLED');
  console.log(`${styleText('bold', 'Telemetry:')} ${state}`);
  console.log(`${styleText('bold', 'Decided by:')} ${SOURCE_LABELS[source]}`);
  if (config?.installId) {
    console.log(`${styleText('bold', 'Install ID:')} ${config.installId} ${styleText('dim', '(random UUID, not tied to you)')}`);
  } else if (config) {
    console.log(`${styleText('bold', 'Install ID:')} ${styleText('dim', 'none recorded')}`);
  } else {
    console.log(`${styleText('bold', 'Install ID:')} ${styleText('dim', 'none (no telemetry config has been written)')}`);
  }
  console.log(`${styleText('bold', 'Config file:')} ${getTelemetryConfigPath()}`);
  console.log(`${styleText('bold', 'Docs:')} ${DOCS_URL}`);
}

function runTelemetryEnable(): void {
  console.error(styleText('yellow', 'Telemetry cannot be enabled in this fork — the analytics path is removed.'));
  console.error('Nothing was written. See src/services/telemetry/consent.ts.');
}

function runTelemetryDisable(): void {
  const existing = loadTelemetryConfig();
  saveTelemetryConfig({
    enabled: false,
    installId: existing?.installId ?? '',
    decidedAt: new Date().toISOString(),
  });

  console.log(styleText('green', 'Telemetry disabled.'));
  console.log(`${styleText('bold', 'Config file:')} ${getTelemetryConfigPath()}`);
}

export async function runTelemetryCommand(argv: string[] = []): Promise<void> {
  const subCommand = argv[0]?.toLowerCase() ?? 'status';

  switch (subCommand) {
    case 'status':
      runTelemetryStatus();
      break;
    case 'enable':
      runTelemetryEnable();
      break;
    case 'disable':
      runTelemetryDisable();
      break;
    default:
      console.error(styleText('red', `Unknown telemetry subcommand: ${subCommand}`));
      printTelemetryUsage();
      process.exit(1);
  }
}
