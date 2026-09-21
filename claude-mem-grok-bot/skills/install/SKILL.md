---
name: claude-mem-install
description: >-
  Use this when setting up claude-mem on Grok Bot: local worker plus the
  host-login observer (default), or a remote worker. No Cursor required.
---
# Install claude-mem on Grok Bot

Independent of Cursor. Grok Bot has no session-start / file-read / tool-use hooks.

## Local worker + host-login observer (default)

```
npx claude-mem install --ide grok-bot
```

With no `--provider`, a non-TTY install resolves to `host` — no account, no API key, no cmem.ai:

- Worker on `127.0.0.1:<port>` (default `37700 + uid%100`). Do not restart if healthy.
- Transcript watcher per Grok Bot agent (`platformSource=grok-bot`)
- Observer via the host agent: a loopback OpenAI-compatible shim on a **free** loopback port (not the worker port), driven by the logged-in Grok agent. Idle replies are `<skip_summary />`; finished units are one `<observation>`.
- MCP `session_start_context` at the start of a real task
- Live INDEX into `agents/<uuid>/memory/log/zz-claude-mem-inject.md` (disable with `CLAUDE_MEM_GROK_BOT_INJECT_ENABLED=false`)

No xAI key. No Claude CLI.

## Optional: name the host observer explicitly

Same result as the default; useful in scripts that must not depend on the implicit resolution.

```
npx claude-mem install --ide grok-bot --provider host
```

This Grok login fulfills inbox jobs (skill host-observer).

## Remote worker / remote observer

Set plugin variable `CLAUDE_MEM_MCP_TOKEN` and use MCP `claude-mem-remote`.

```
npx claude-mem install --ide grok-bot --runtime server --server-url https://cmem.ai
```
