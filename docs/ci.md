# CI Usage

AGENTS.md Doctor is designed to run before agent work starts and before
instruction drift reaches `main`. The stable machine-readable report surface is
JSON output from `lint`, `verify`, and `explain`.

## Recommended Gate

For most repositories, start with `verify --json`. It includes lint findings and
repository coverage sanity checks in one report.

```yaml
name: Agent Instructions

on:
  pull_request:
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  agents-doctor:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Setup Node
        uses: actions/setup-node@v5
        with:
          node-version: 22

      - name: Verify AGENTS.md instructions
        run: npx agents-doctor@latest verify --json .
```

Exit code behavior:

- `0`: no error findings, and warnings are allowed.
- `1`: error findings, or warnings when strict warning failure is enabled.
- `2`: usage, config, or runtime failure.

## Stricter Warning Policy

Use `--strict`, `--fail-on-warning`, or `"failOnWarning": true` when warnings
should fail CI.

```yaml
      - name: Verify AGENTS.md instructions strictly
        run: npx agents-doctor@latest verify --json --fail-on-warning .
```

Strict mode changes the process/report exit code only. It does not rewrite
finding severities in JSON output.

## Source-Checkout Validation

When validating this repository from source instead of the published package,
build before running the CLI.

```yaml
      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Verify fixtures or workspace
        run: node dist/cli.js verify --json .
```

The project CI currently runs typecheck, tests, build, built-CLI smoke checks,
packed-package smoke checks, and benchmark checks.

## Annotation Patterns

Use `--format github` with `lint` or `verify` to emit GitHub workflow
annotations before the human summary.

```yaml
      - name: Verify AGENTS.md instructions with annotations
        run: npx agents-doctor@latest verify --format github .
```

`--format github` maps severities as:

- `error` -> GitHub `error`
- `warning` -> GitHub `warning`
- `info` -> GitHub `notice`

If you need custom annotation behavior, parse `findings[]` from JSON and emit
workflow commands in your own wrapper.

Minimal wrapper logic:

1. Run `agents-doctor verify --json .` and capture stdout.
2. Parse the JSON report.
3. For each finding, map `severity` to your CI annotation level.
4. Use `file`, `line`, and `message` when present.
5. Preserve the original process exit code from AGENTS.md Doctor.

Recommended custom mapping:

- `error` -> GitHub `error`
- `warning` -> GitHub `warning`
- `info` -> GitHub `notice`

## Trust Boundaries

AGENTS.md Doctor is a repository inspection tool, not a command runner.

- It does not execute commands found in `AGENTS.md`.
- It does not run package scripts from the target repository.
- It does not upload repository contents.
- It treats JSON output as the CI contract; prose output is for humans.
- It reports deterministic findings from files and repository metadata.

## Maintainer Release Workflow

Releases are intended to publish from GitHub Actions, not from local machine
state. The release workflow runs on `v*` tag pushes and manual dispatch. It
performs the release gate before publishing:

1. `npm ci`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`
5. `npm run smoke`
6. `npm run smoke:pack`
7. `npm run benchmark`
8. `npm publish --provenance --access public`

The workflow uses `NODE_AUTH_TOKEN` from the repository `NPM_TOKEN` secret and
requests `id-token: write` for npm provenance. It does not bump versions; the
version, changelog, commit, and tag must already agree before the release
workflow is triggered.

Local `npm publish` is a maintainer fallback only. Prefer the release workflow
when publishing public versions.

## Package Tarball Policy

`npm run smoke:pack` validates both install behavior and package contents. It
parses `npm pack --json` and allows only the public package surface:

- `dist/`
- `docs/`
- `examples/`
- `README.md`
- `CHANGELOG.md`
- `AGENTS.md`
- `LICENSE`
- `package.json`

The smoke check rejects workspace-only material such as `agents/`, `notes/`,
`PROJECT_MEMORY_REFERENCE.md`, and `benchmarks/out/`. It also scans packed
public text files for local absolute paths and token/secret-looking strings.
The packed package size is printed as part of the smoke output.

## Security Automation

The repository includes automation for:

- CodeQL analysis for JavaScript/TypeScript and GitHub Actions workflows.
- Dependency review on pull requests.
- Dependabot update pull requests for npm and GitHub Actions dependencies.

These checks are review gates, not auto-merge rules.

## Optional Formats

Current `lint` and `verify` output formats:

- Human-readable terminal output, enabled by default.
- JSON report output, enabled with `--json`.
- JSON report output, enabled with `--format json`.
- GitHub annotation output plus human summary, enabled with `--format github`.
- SARIF 2.1.0 output, enabled with `--format sarif`.

`--json` takes precedence when both `--json` and `--format` are provided.

`explain` currently supports default human output and `--json`.
