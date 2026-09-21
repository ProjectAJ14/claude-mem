type InstallerProviderId = 'claude' | 'gemini' | 'openrouter' | 'host';
type InstallerProviderChoice = InstallerProviderId;

/**
 * Implicit provider when `--provider` is omitted.
 *
 * Fork: grok-bot's implicit default is `host`, not CMEM Pro. Upstream returned
 * a `cmem` sentinel here, which install.ts mapped to the cmem.ai inference
 * gateway after a browser OAuth login. With the account gone that sentinel has
 * no branch left to reach, so grok-bot defaults to the account-free path it
 * already had: the host observer, which drives the logged-in Grok agent over a
 * local OpenAI-compatible shim. Other IDEs still have no implicit provider and
 * must name one on a non-TTY install.
 *
 * Applied at the CLI boundary in `src/npx-cli/index.ts` for non-TTY
 * `install --ide grok-bot`.
 */
export function resolveInstallerProviderChoice(
  options: { ide?: string; provider?: InstallerProviderId },
): InstallerProviderChoice | undefined {
  if (options.provider) return options.provider;
  if (options.ide === 'grok-bot') return 'host';
  return undefined;
}
