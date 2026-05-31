# Claude Project Notes

AGENTS.md Doctor can detect Claude Code instruction surfaces, but it is still
an AGENTS.md-first checker.

## What Works Now

- `explain --json` reports Claude Code tool evidence when it finds `CLAUDE.md`
  files in the target ancestry or `.claude/**/*.md` files inside the selected
  repository root.
- Tool evidence includes limitations such as `claude-import-semantics-not-modeled`
  and `claude-memory-scope-not-attested`.
- When `instructionGraph.enabled` is true, the instruction graph can include
  `CLAUDE.md` and `.claude/**/*.md` files that are reached through supported
  local references.
- All scanning stays inside the selected repository root. AGENTS.md Doctor does
  not read user/global Claude memory such as files under a home directory.

## Current Limits

- `lint` and `verify` lint rules discover `AGENTS.md` files by default. A
  Claude-only repository can opt in to linting `CLAUDE.md` with
  the `claude-code` tool profile or explicit `lintFileNames`.
- Claude-style `@path` imports are not modeled as instruction graph edges yet.
  Standard Markdown links and inline-code path references are the current safe
  deterministic boundary.
- `.claude/settings.json`, hooks, permissions, MCP config, slash commands,
  skills, and subagent definitions are not audited as Claude runtime
  configuration.
- Global Claude memory is intentionally out of scope because AGENTS.md Doctor is
  a repository-scoped checker and should not inspect private user state.

## Practical Setup

For a Claude-first repository, either keep a small `AGENTS.md` at the
repository root that points humans and tools to the Claude instructions:

```md
# Instructions

This repository uses Claude Code. See `CLAUDE.md` for project instructions.

## Safety

Follow the repository safety rules in `CLAUDE.md`.

## Testing

Follow the repository testing rules in `CLAUDE.md`.
```

If your project stores generated Claude transcripts or caches, ignore them
explicitly:

```json
{
  "toolProfile": "claude-code",
  "lintFileNames": ["AGENTS.md", "CLAUDE.md"],
  "ignore": [
    ".claude/cache/**",
    ".claude/sessions/**"
  ]
}
```

## Backlog

Potential future Claude-first support should stay opt-in and deterministic:

- Claude `@path` import inventory for instruction graph mode.
- Slash-command reference checks from instruction files to `.claude/commands/`.
- Safe inventory for `.claude/settings.json` and `.claude/agents/*.md` without
  reading global user state or executing hooks.
