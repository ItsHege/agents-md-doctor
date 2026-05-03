# Roadmap

AGENTS.md Doctor currently ships `lint`, `verify`, and `explain` with
deterministic checks and CI-friendly output. This roadmap covers the next
public milestones.

## Near Term

- Expand instruction graph benchmarks with more nested and monorepo targets.
- Harden optional GitHub annotation and SARIF output based on CI feedback.
- Improve path context for monorepos and generated-file references based on
  reviewed benchmark labels.

## Next

- Add `agents-doctor init` to create a starter configuration and docs scaffold.
- Expand fixture coverage with more real-world examples from public repositories.
- Continue improving human-readable output while keeping JSON output stable.

## Longer Term

- Extend deterministic checks across more repository layouts and toolchains.
- Improve explainability for inheritance and rule resolution in complex monorepos.
- Keep rule docs and CI examples aligned with shipped behavior.
