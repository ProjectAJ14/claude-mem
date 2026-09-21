import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(
  join(__dirname, '..', '..', 'src', 'npx-cli', 'commands', 'install.ts'),
  'utf-8',
);

// Fork: no install requires a claude-mem account. Upstream gated every install
// without `--provider claude|host` behind a browser OAuth round-trip to
// cmem.ai; these assertions pin the gate staying gone through upstream syncs,
// which is the only thing that would quietly reintroduce it.
describe('provider account gate', () => {
  it('exempts every install from the account requirement', () => {
    expect(source).toMatch(
      /export function providerNeedsAccount\([^)]*\): boolean \{(?:[^}]|\n)*?\n  return false;\n\}/,
    );
  });

  it('never calls the installer OAuth login', () => {
    expect(source).not.toContain('await requireInstallerOAuthLogin(');
  });

  it('leaves the pairing null for provider selection', () => {
    expect(source).toContain('const oauthPairing: InstallerOAuthPairing | null = null;');
  });

  it('still treats openrouter and gemini as key-backed providers', () => {
    expect(source).toContain("if (options.provider !== 'gemini' && options.provider !== 'openrouter') return;");
  });
});

describe('install flow wiring', () => {
  it('offers no provider screen, because only the local Claude provider remains', () => {
    expect(source).not.toContain('p.multiselect<ProviderChoice>');
    expect(source).toContain("    selectedProvider = 'claude';");
  });

  it('carries no CMEM Pro enrollment branch', () => {
    expect(source).not.toContain("selectedProvider === 'cmem'");
    expect(source).not.toContain('completeCmemTrialPairing(pairing');
  });

  it('never links the cmem.ai trial from the installer', () => {
    expect(source).not.toContain('pro-promo');
    expect(source).not.toContain('PRO_TRIAL_PITCH');
  });
});
