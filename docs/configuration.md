# Configuration

AGENTS.md Doctor reads `.agents-doctor.json` from the repository root.
Missing config is valid and uses defaults.

Create a starter config with:

```bash
agents-doctor init .
```

`init` does not overwrite an existing `.agents-doctor.json` unless `--force` is
provided.

## Example

```json
{
  "ignore": ["tests/fixtures/**"],
  "toolProfile": "auto",
  "lintFileNames": ["AGENTS.md"],
  "maxLines": 500,
  "failOnWarning": false,
  "annotationMinSeverity": "info",
  "instructionGraph": {
    "enabled": false,
    "maxDepth": 2,
    "include": [
      "**/AGENTS.md",
      "**/.agents/**/*.md",
      "**/docs/agents/**/*.md",
      "**/docs/agent/**/*.md",
      "**/CLAUDE.md",
      "**/GEMINI.md",
      "**/.claude/**/*.md",
      "**/.github/copilot-instructions.md",
      "**/.cursor/rules/**/*.md",
      "**/.cursor/rules/**/*.mdc"
    ]
  },
  "contextHygiene": {
    "enabled": false,
    "staleAfterDays": 60,
    "include": ["**/*.md", "**/*.mdx"],
    "ignore": [],
    "publicPaths": [".", "docs", "examples"],
    "publicScopeInstructionPaths": [
      "**/AGENTS.md",
      "**/CLAUDE.md",
      "**/GEMINI.md",
      ".github/copilot-instructions.md",
      ".github/instructions/**/*.md",
      ".cursor/rules/**/*.md",
      ".windsurf/rules/**/*.md",
      ".clinerules/**/*.md"
    ],
    "overlapDetection": "exact",
    "overlapTokenMinLength": 4,
    "maxFileSizeKb": 1000,
    "maxFilesScanned": 500,
    "maxDepth": 40
  },
  "promptInjection": {
    "enabled": false,
    "include": [
      "**/AGENTS.md",
      "**/CLAUDE.md",
      "**/GEMINI.md",
      ".github/copilot-instructions.md",
      ".github/instructions/**/*.md",
      ".cursor/rules/**/*.md",
      ".cursor/rules/**/*.mdc",
      ".windsurf/rules/**/*.md",
      ".clinerules/**/*.md"
    ],
    "ignore": [],
    "scanCodeBlocks": false,
    "maxFileSizeKb": 1000,
    "maxFilesScanned": 500,
    "maxDepth": 40
  },
  "reviewedFindings": [],
  "rules": {
    "size.file_too_long": {
      "severity": "warning",
      "maxLines": 500
    },
    "structure.required_sections": {
      "severity": "warning",
      "requiredHeadings": ["Safety", "Testing"]
    }
  }
}
```

## Fields

- `ignore`: repo-relative glob patterns skipped during discovery and graph loading.
- `toolProfile`: optional deterministic tool focus. Defaults to `auto`.
  Supported values are `auto`, `codex`, `claude-code`, `cursor`, `gemini-cli`,
  `github-copilot`, `windsurf`, and `cline`.
- `lintFileNames`: file names to lint during `lint` and `verify`. Defaults to
  the selected `toolProfile` preset. In `auto`, the default is `["AGENTS.md"]`.
  In `claude-code`, the default is `["AGENTS.md", "CLAUDE.md"]`. In
  `gemini-cli`, the default is `["AGENTS.md", "GEMINI.md"]`. Entries must be
  file names, not paths.
- `maxLines`: default line threshold for `size.file_too_long`.
- `failOnWarning`: makes warnings produce exit code `1`.
- `annotationMinSeverity`: optional minimum severity for GitHub workflow
  annotations when using `--format github`. Supported values are `info`,
  `warning`, and `error`. This filters only annotation lines; reports, human
  summaries, SARIF, JSON, and exit codes remain complete.
- `rules`: per-rule options and severity overrides.
- `instructionGraph.enabled`: opt-in instruction graph traversal for `verify` and `explain`.
- `instructionGraph.maxDepth`: traversal depth from discovered or applied `AGENTS.md` files, from `0` to `10`.
- `instructionGraph.include`: repo-relative glob allowlist for referenced instruction files.
- `contextHygiene.enabled`: opt-in `verify` audit for stale, overlapping, or
  public-scope planning notes. Defaults to `false`. The CLI flag
  `--context-hygiene` enables it for one run.
- `contextHygiene.staleAfterDays`: planning file age threshold. Defaults to
  `60`. Override one run with `--context-stale-days <days>`.
- `contextHygiene.include`: repo-relative Markdown/MDX globs scanned by
  context hygiene. Defaults to `["**/*.md", "**/*.mdx"]`.
- `contextHygiene.ignore`: additional repo-relative globs skipped only by
  context hygiene.
- `contextHygiene.publicPaths`: public documentation scopes where active
  planning notes are reported. `"."` means root-level files only; `docs` and
  `examples` mean those directories.
- `contextHygiene.publicScopeInstructionPaths`: repo-relative globs for
  instruction surfaces treated as public context. Defaults include AGENTS,
  Claude, Gemini, GitHub Copilot, Cursor, Windsurf, and Cline Markdown
  instruction surfaces.
- `contextHygiene.overlapDetection`: currently only `"exact"`. Fuzzy or
  semantic overlap detection is future work.
- `contextHygiene.overlapTokenMinLength`: minimum length for non-version exact
  overlap tokens. Defaults to `4`.
- `contextHygiene.maxFileSizeKb`: maximum Markdown file size read by context
  hygiene. Defaults to `1000`.
- `contextHygiene.maxFilesScanned`: maximum Markdown files scanned by context
  hygiene before the summary reports `truncated: true`. Defaults to `500`.
- `contextHygiene.maxDepth`: maximum directory depth for context hygiene scans.
  Defaults to `40`.
- `promptInjection.enabled`: opt-in `verify` audit for high-confidence prompt
  injection wording in local instruction surfaces. Defaults to `false`. The CLI
  flag `--prompt-injection` enables it for one run.
- `promptInjection.include`: repo-relative globs scanned by prompt injection
  audit. Defaults to AGENTS, Claude, Gemini, GitHub Copilot, Cursor, Windsurf,
  and Cline instruction surfaces.
- `promptInjection.ignore`: additional repo-relative globs skipped only by
  prompt injection audit.
- `promptInjection.scanCodeBlocks`: include fenced code blocks in prompt
  injection scanning. Defaults to `false` to avoid flagging security examples.
  Override one run with `--prompt-injection-scan-code-blocks`.
- `promptInjection.maxFileSizeKb`: maximum file size read by prompt injection
  audit. Defaults to `1000`.
- `promptInjection.maxFilesScanned`: maximum files scanned by prompt injection
  audit before the summary reports `truncated: true`. Defaults to `500`.
- `promptInjection.maxDepth`: maximum directory depth for prompt injection
  scans. Defaults to `40`.
- `reviewedFindings`: repo-local reviewed finding fingerprints. Matching
  findings are downgraded to `info` and keep additive
  `details.reviewedFinding` metadata so repeated intentional warnings do not
  keep blocking the same project. Supported statuses are `intentional`,
  `false_positive`, and `accepted_risk`. The desktop UI shows these reviewed
  findings in its `Ignored` section and can remove selected fingerprints when a
  finding should become actionable again.

Rule severity can be `error`, `warning`, `info`, or `off`.

CLI flags override matching config values for ignore patterns, max-line
thresholds, profile, and warning failure behavior. If `lintFileNames` is set in
config, it remains explicit and is not replaced by a CLI `--profile` preset.

Use `lintFileNames` only when the repository deliberately wants AGENTS.md Doctor
rules to apply to another repository instruction file family:

```json
{
  "lintFileNames": ["AGENTS.md", "CLAUDE.md"]
}
```

Use `reviewedFindings` only for project-specific exceptions after a human or
responsible agent has reviewed the finding. It is intentionally more precise
than turning a rule off:

```json
{
  "reviewedFindings": [
    {
      "fingerprint": "adf_v1_8e5f5dbff1a14b5f2f2aa24b",
      "status": "intentional",
      "ruleId": "context.overlapping_plan_files",
      "file": "notes/release-snapshot-2026-06-04.md",
      "note": "Historical evidence snapshot kept intentionally."
    }
  ]
}
```

Rule severity overrides apply to normal missing command findings. The
`commands.mentioned_command_missing` `scope_ambiguous` case stays
warning-only when the referenced script exists in a workspace package but not
the local package, because the result needs human package-scope review.

Graph mechanics findings use the same rule override mechanism:

```json
{
  "rules": {
    "inheritance.instruction_graph_summary": {
      "severity": "off"
    },
    "inheritance.referenced_instruction_missing": {
      "severity": "error"
    }
  }
}
```

Codex profile runtime findings can also be configured by rule id. For example,
repo-local malformed `.codex/agents/*.toml` role files are errors by default:

```json
{
  "rules": {
    "runtime.codex_agent_role_invalid": {
      "severity": "warning"
    }
  }
}
```

## Instruction Graph Defaults

Instruction graph traversal is disabled by default to avoid surprising users
with findings from documentation fragments.

When enabled, AGENTS.md Doctor follows only explicit local Markdown links and
inline-code references that look like agent instruction files. It does not scan
all documentation, follow remote URLs, follow symlinks, or read outside the
repository boundary.

## Context Hygiene Defaults

Context hygiene is disabled by default because planning notes are often
repository-specific. When enabled, it scans bounded Markdown and MDX files for
planning signals such as `plan`, `roadmap`, `todo`, `next`, `backlog`, `phase`,
`notes`, `WIP`, `TODO`, `Draft`, `Blocked`, `In progress`, and `Next steps`.

A file is treated as planning-like when its path/name has a planning signal, or
when its content has at least five planning marker occurrences. Common public
docs such as `README.md`, `CONTRIBUTING.md`, and `CHANGELOG.md` are not treated
as planning files from content markers alone.

It does not delete, move, archive, rewrite, or execute anything. Findings
include a structured `cleanupRequest` that can be copied to a responsible
coding agent or used in a manual cleanup review.

## Prompt Injection Defaults

Prompt injection auditing is disabled by default and only runs during `verify`
when `--prompt-injection` is passed or `promptInjection.enabled` is true.

The default include scope is intentionally narrower than context hygiene. It
checks local instruction surfaces such as `AGENTS.md`, `CLAUDE.md`,
`GEMINI.md`, GitHub Copilot instructions, Cursor rules, Windsurf rules, and
Cline rules. Broader documentation scans must be configured explicitly with
`promptInjection.include`.

The audit uses deterministic text patterns for high-risk wording such as
instruction overrides, hidden prompt or credential requests, external transfer
requests, and untrusted command execution requests. It does not call an LLM,
make network requests, read secrets or environment values, or execute commands.
Fenced code blocks and inline code are ignored by default so security docs can
quote bad examples without becoming findings.
