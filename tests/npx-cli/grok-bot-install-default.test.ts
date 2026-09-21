import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { resolveInstallerProviderChoice } from '../../src/npx-cli/installer-provider-choice';

const repoRoot = join(__dirname, '..', '..');

describe('grok-bot install default provider', () => {
  it('defaults --ide grok-bot with no --provider to the host observer', () => {
    expect(resolveInstallerProviderChoice({ ide: 'grok-bot' })).toBe('host');
  });

  it('keeps --provider host as an explicit grok-bot opt-in', () => {
    expect(resolveInstallerProviderChoice({ ide: 'grok-bot', provider: 'host' })).toBe('host');
  });

  it('does not invent a non-interactive default for other IDEs', () => {
    expect(resolveInstallerProviderChoice({ ide: 'cursor' })).toBeUndefined();
    expect(resolveInstallerProviderChoice({ ide: 'claude-code' })).toBeUndefined();
    expect(resolveInstallerProviderChoice({})).toBeUndefined();
  });

  // Fork: inverted. The default is the account-free host observer, and the
  // docs must not send a grok-bot install at the cmem.ai gateway.
  it('documents the host observer as the grok-bot plugin default', () => {
    const skill = readFileSync(join(repoRoot, 'claude-mem-grok-bot/skills/install/SKILL.md'), 'utf-8');
    const readme = readFileSync(join(repoRoot, 'claude-mem-grok-bot/README.md'), 'utf-8');
    const defaultSection = skill.split('## Optional')[0];

    expect(defaultSection).toContain('npx claude-mem install --ide grok-bot');
    expect(defaultSection).not.toContain('https://cmem.ai/api/inference/v1');
    expect(defaultSection).not.toContain('cmem-observer');
    expect(defaultSection.toLowerCase()).toContain('host-login observer (default)');
    expect(skill).toContain('npx claude-mem install --ide grok-bot --provider host');
    expect(readme).toContain('npx claude-mem install --ide grok-bot');
  });

  it('keeps installer provider-cutover and does not recycle a healthy worker from settings POST', () => {
    const source = readFileSync(join(repoRoot, 'src/npx-cli/commands/install.ts'), 'utf-8');
    expect(source).toContain("'provider-cutover'");
    expect(source).toContain('POST /api/settings still must not recycle a healthy worker');
  });

  it('applies the grok-bot host-observer default at the CLI boundary for non-TTY installs', () => {
    const cli = readFileSync(join(repoRoot, 'src/npx-cli/index.ts'), 'utf-8');
    const install = readFileSync(join(repoRoot, 'src/npx-cli/commands/install.ts'), 'utf-8');
    const grokInstaller = readFileSync(join(repoRoot, 'src/services/integrations/GrokBotInstaller.ts'), 'utf-8');
    expect(cli).toContain("from './installer-provider-choice.js'");
    expect(cli).toContain('resolveInstallerProviderChoice');
    expect(cli).toContain('process.stdin.isTTY');
    // Fork: no provider prompt at all — the interactive path picks the same
    // local provider the flag would, so there is no CMEM pre-selection left.
    expect(install).not.toContain("initialValues: ['cmem']");
    expect(grokInstaller).toContain('GROK_BOT_AGENT_DATA');
  });
});
