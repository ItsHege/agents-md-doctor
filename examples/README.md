# Examples

These examples are public onboarding material for AGENTS.md Doctor. Sample
instruction files use `AGENTS.sample.md` so this repository does not lint them
as its own active instructions.

## Pick A Starting Point

- Minimal repo: `examples/minimal-repo/`
- Monorepo scope-ambiguous command: `examples/monorepo-scope-ambiguous/`
- Missing path finding: `examples/missing-path/`
- Instruction graph opt-in: `examples/instruction-graph-opt-in/`
- CI output formats: `examples/ci-output-formats/`

## First Command

For most repositories, start with:

```bash
npx agents-doctor@latest verify --json .
```

Then classify findings:

- `TP`: valid and useful finding.
- `FP`: objectively incorrect finding.
- `Needs-Config`: expected repo-local policy noise that should be configured.
- `Unclear`: needs manual review before editing.

Do not silence findings just to reach zero warnings. Fix real drift, configure
intentional repo policy, and keep unclear findings visible until reviewed.

