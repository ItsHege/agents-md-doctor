# Benchmark Methodology

This document defines the M1 real-repository benchmark process for AGENTS.md Doctor.

## Goals

- Measure real-world signal quality before adding more rules.
- Track false positives and noise reduction over time.
- Keep benchmark runs deterministic and safe.

## Inputs

- Manifest: benchmarks/repos.json
  - repo URL
  - pinned commit SHA
  - repository type (`no-agents`, `single`, `nested`, `monorepo`)
  - expected status marker
  - notes
- Expectations: benchmarks/expected-findings.json
  - deterministic rule assertions per repo/command
  - expected severity
  - expected TP/FP label intent

## Execution

Run:

```bash
npm run build
npm run benchmark
```

The benchmark runner performs only:

1. `git clone` (shallow) for each pinned repository.
2. checkout/fetch to the pinned commit SHA.
3. `agents-doctor lint --json <repo>`.
4. `agents-doctor verify --json <repo>`.
5. `agents-doctor explain --json <target> <repo>` for configured graph targets.

The runner does not execute scripts from benchmarked repositories.

## Output

- Machine-readable result: benchmarks/out/latest.json
- Includes:
  - per-repo lint/verify summaries
  - findings grouped by rule
  - graph target explain summaries
  - expectation pass/fail summary
  - operational failures (clone, checkout, runtime)

## Graph Targets

Benchmark repositories can define `graphTargets` in `benchmarks/repos.json`.
Each target is a repo-relative path used to validate `explain --json` applied
chain behavior.

Graph expectations live in `benchmarks/expected-findings.json` under
`graphExpectations`. They assert deterministic `appliedFiles` chains for pinned
commits. They do not depend on human CLI output or prose wording.

## Labeling Rules

Use these labels when reviewing findings:

- `TP`: valid and useful finding.
- `FP`: incorrect finding; should be fixed in rules/heuristics.
- `Needs-Config`: expected repo-local policy noise that should be handled by configuration.
- `Unclear`: needs manual judgment or more evidence.

## Precision and FP Tracking

For a given rule:

- Precision = TP / (TP + FP)
- FP rate = FP / (TP + FP)

Severity-weighted tracking can be added after enough baseline samples.

## Critical FP Definition

A finding is treated as critical FP when any of these are true:

- severity is `error` and the finding is objectively incorrect;
- repeated false positive appears across multiple benchmark repositories;
- finding causes likely CI gating pain in normal non-strict workflows.

Critical FPs block rule promotion and should be fixed before wider CI annotation rollout.
