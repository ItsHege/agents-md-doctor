# Roadmap

AGENTS.md Doctor currently ships `lint`, `verify`, and `explain` with
deterministic checks and CI-friendly output. This roadmap covers the next
public milestones.

## Near Term

- Improve deterministic policy conflict detection for nested `AGENTS.md` files.
- Publish GitHub Actions examples, including clear CI annotation patterns.
- Add optional SARIF output for code scanning integrations.

## Next

- Add `agents-doctor init` to create a starter configuration and docs scaffold.
- Expand fixture coverage with more real-world examples from public repositories.
- Continue improving human-readable output while keeping JSON output stable.

## Longer Term

- Extend deterministic checks across more repository layouts and toolchains.
- Improve explainability for inheritance and rule resolution in complex monorepos.
- Keep rule docs and CI examples aligned with shipped behavior.
