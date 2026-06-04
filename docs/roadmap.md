# Roadmap

AGENTS.md Doctor currently ships `lint`, `verify`, and `explain` with
deterministic checks and CI-friendly output. This roadmap covers the next
public milestones.

## Near Term

- Expand the public context-fidelity guide and examples for teams mixing Codex,
  Claude Code, Cursor, Gemini CLI, GitHub Copilot, Windsurf, and Cline.
- Improve the desktop preview so new `explain` evidence is easier to scan and
  copy into agent handoff workflows.
- Improve opt-in Claude-first support after the current AGENTS.md-first boundary
  is documented and tested, for example deterministic Claude import/command
  inventory.
- Expand tool profiles beyond the current deterministic presets while keeping
  `auto` as the default and avoiding model APIs or external tool calls.
- Expand instruction graph benchmarks with more nested and monorepo targets.
- Harden optional GitHub annotation and SARIF output based on CI feedback.
- Migrate npm publishing from long-lived token authentication to trusted
  publishing after npm package settings are configured and a release test is
  planned.
- Improve path context for monorepos and generated-file references based on
  reviewed benchmark labels.

## Next

- Improve `agents-doctor init` onboarding and docs scaffolding based on
  first-use feedback.
- Add more source-backed examples for native, compatible, partial, and
  not-found tool-evidence states.
- Expand fixture coverage with more real-world examples from public repositories.
- Continue improving human-readable output while keeping JSON output stable.

## Longer Term

- Extend deterministic checks across more repository layouts and toolchains.
- Improve explainability for inheritance and rule resolution in complex monorepos.
- Keep rule docs and CI examples aligned with shipped behavior.
