# Instruction Graph Opt-In

Instruction graph validation is disabled by default. Enable it only when you
want AGENTS.md Doctor to follow explicit local references to instruction-like
files.

This example enables graph traversal in `.agents-doctor.json` and references
`docs/agent/testing.md` from `AGENTS.sample.md`.

Run after copying `AGENTS.sample.md` to `AGENTS.md`:

```bash
npx agents-doctor@latest verify --json .
npx agents-doctor@latest explain --json src/index.ts .
```

Expected graph-related findings include
`inheritance.instruction_graph_summary`. Missing referenced instruction files,
cycles, and depth limits are reported only when graph traversal is enabled.

