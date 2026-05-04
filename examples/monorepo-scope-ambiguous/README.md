# Monorepo Scope-Ambiguous Command

This example shows a warning that needs package-scope review instead of an
automatic edit.

`AGENTS.sample.md` references `pnpm run dev` from the repository root. The root
`package.json` does not declare `dev`, but `apps/web/package.json` does. AGENTS.md
Doctor reports `commands.mentioned_command_missing` with
`details.reason: "scope_ambiguous"` and keeps it warning-only.

Typical triage: `Needs-Config` if the repository intentionally documents
workspace-package commands from the root instruction file, or `TP` if the
instruction should name the package scope more clearly.

