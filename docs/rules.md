# Rules

This catalog lists AGENTS.md Doctor rule and report finding IDs.

## Rule Findings

Rule findings describe instruction file problems detected by `lint` and by
commands that include lint behavior, such as `verify`.

## Finding Triage

AGENTS.md Doctor reports deterministic findings; it does not know every
repository policy decision. During review, classify findings before editing:

- `TP`: valid and useful finding. Fix stale instructions, missing files, missing
  command declarations, oversized guidance, or risky wording.
- `FP`: objectively incorrect finding. Keep the file, line, and command output
  as evidence for an upstream rule fix.
- `Needs-Config`: expected repo-local policy noise. Use `.agents-doctor.json`
  to ignore intentional fixtures, adjust required headings, tune max lines, or
  change severity.
- `Unclear`: needs human context. Do not silence it just to make the report
  clean.

These labels are review vocabulary. They do not change CLI severities, exit
codes, JSON reports, GitHub annotations, or SARIF output.

## `size.file_too_long`

- Category: `size`
- Default severity: `warning`
- Default threshold: more than 500 logical lines
- Config options: `severity`, `maxLines`

Reports `AGENTS.md` files that exceed the configured line threshold. Blank
lines count as lines; one final trailing newline does not add a fake extra line.

Example finding:

```text
warning size.file_too_long AGENTS.md:1
AGENTS.md has 501 lines. Recommended maximum: 500 lines.
```

Fix by splitting overly broad instructions into smaller scoped `AGENTS.md`
files, deleting stale boilerplate, or raising `maxLines` intentionally in
`.agents-doctor.json`.

## `structure.required_sections`

- Category: `structure`
- Default severity: `warning`
- Default required headings: `Safety`, `Testing`
- Config options: `severity`, `requiredHeadings`

Reports `AGENTS.md` files that do not contain required section headings.
Matching is case-insensitive and substring-based, so headings such as
`Safety Rules` and `Testing Expectations` satisfy the defaults.

Example finding:

```text
warning structure.required_sections AGENTS.md:1
AGENTS.md is missing required section headings: Safety, Testing.
```

Fix by adding the missing sections, or configure the expected headings for your
repository.

## Configuration

Rules can be configured in `.agents-doctor.json` at the repository root:

```json
{
  "ignore": ["tests/fixtures/**"],
  "maxLines": 500,
  "failOnWarning": false,
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

Rule severity can be `error`, `warning`, `info`, or `off`.

## `paths.reference_missing`

- Category: `paths`
- Default severity: `warning`
- Config options: `severity`

Reports missing or outside-repo path references found in Markdown links and
path-like inline code.

The rule intentionally ignores common non-repository-path prose, including
obvious placeholders, URLs, module specifiers, system absolute paths, generated
output directory mentions, generated/cache directory-style references with
clear output context, and contextual example/template bare filenames. It still
reports explicit root config references such as `package-lock.json` and
`.travis.yml`, plus explicit path-like references such as `src/missing.ts` or a
missing documentation directory without generated-output context. Path matching
is case-aware so references that work only on case-insensitive filesystems are
still reported before they fail in Linux CI.

Example finding:

```text
warning paths.reference_missing AGENTS.md:12
AGENTS.md references a missing path: ./docs/missing.md.
```

## `commands.mentioned_command_missing`

- Category: `commands`
- Default severity: `error`
- Config options: `severity`

Reports command references found in inline code or fenced code blocks when the
referenced package script or Makefile target is not declared.

When a script is missing from the local package but exists in another workspace
package, AGENTS.md Doctor reports the same rule id with
`details.reason: "scope_ambiguous"`. That scope-ambiguous case is
warning-only, even if the rule severity is configured to `error`, because the
tool cannot prove that the instruction is wrong without a clearer package
scope.

Example finding:

```text
error commands.mentioned_command_missing AGENTS.md:8
AGENTS.md references a missing package script: lint:ci.
```

## `security.risky_instruction`

- Category: `security`
- Default severity: `warning`
- Config options: `severity`

Reports high-confidence risky instruction patterns such as command execution
from AGENTS.md, environment dump instructions, secret-file reads, or repository
upload instructions.

Example finding:

```text
warning security.risky_instruction AGENTS.md:20
AGENTS.md contains a risky instruction: instruction suggests dumping environment variables.
```

## Context Hygiene Findings

Context hygiene findings are emitted only when `verify --context-hygiene` is
used or `.agents-doctor.json` sets `contextHygiene.enabled: true`.

The audit scans bounded `.md` and `.mdx` files, skips symlinks and ignored
paths, and does not delete, move, archive, rewrite, or execute anything.

If a context hygiene warning is intentional for one repository, prefer adding
the finding fingerprint to `.agents-doctor.json` `reviewedFindings` instead of
turning the whole rule off. Reviewed findings are downgraded to `info` on later
runs while new or changed warnings still stay visible.

Planning-like files are detected when the path/name contains a planning signal
such as `plan`, `roadmap`, `todo`, `next`, `backlog`, `phase`, or `notes`, or
when the content contains at least five planning marker occurrences. Common
public docs such as `README.md`, `CONTRIBUTING.md`, and `CHANGELOG.md` are not
classified from content markers alone.

### `context.stale_plan_file`

- Category: `context`
- Default severity: `warning`
- Config options: `contextHygiene.staleAfterDays`

Reports active-looking planning files older than the configured threshold.
Default threshold is `60` days; one run can override it with
`--context-stale-days <days>`.

### `context.overlapping_plan_files`

- Category: `context`
- Default severity: `warning`
- Detection: exact matching only

Reports two or more active-looking planning files that share exact strong
tokens such as the same version string, slug, normalized heading, or explicit
feature label. Fuzzy or semantic matching is intentionally not used. Weak
tokens, common planning words, and non-version tokens shorter than
`contextHygiene.overlapTokenMinLength` are ignored.

### `context.private_plan_in_public_scope`

- Category: `context`
- Default severity: `warning`

Reports planning signals in public documentation scopes or public instruction
surfaces. By default, root-level Markdown, `docs/`, `examples/`, and instruction
files such as `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, GitHub Copilot, Cursor,
Windsurf, and Cline Markdown rule files count as public scope.

### `context.planning_summary`

- Category: `context`
- Default severity: `info`

Summarizes how many Markdown files were scanned, how many planning-like files
were found, and whether any files were skipped because of read limits.

## Prompt Injection Findings

Prompt injection findings are emitted only when `verify --prompt-injection` is
used or `.agents-doctor.json` sets `promptInjection.enabled: true`.

The audit scans bounded configured instruction surfaces, skips symlinks and
ignored paths, and ignores fenced code blocks by default. It is deterministic:
it does not call an LLM, make network requests, read secrets or environment
values, execute commands, or upload repository contents.

### `security.prompt_injection_override`

- Category: `security`
- Default severity: `warning`

Reports high-confidence wording that asks an agent to ignore, disregard,
override, or bypass previous, system, developer, or higher-priority
instructions.

### `security.prompt_injection_secret_request`

- Category: `security`
- Default severity: `warning`

Reports high-confidence wording that asks an agent to reveal hidden prompts,
system/developer messages, policies, credentials, tokens, `.env`, or
environment variables.

### `security.prompt_injection_external_transfer`

- Category: `security`
- Default severity: `warning`

Reports high-confidence wording that asks an agent to send sensitive context,
secrets, tokens, credentials, or hidden prompts to an external endpoint.

### `security.prompt_injection_untrusted_execution`

- Category: `security`
- Default severity: `warning`

Reports wording that asks an agent to execute commands supplied by a prompt,
remote content, webpage, or fetched content.

### `security.prompt_injection_summary`

- Category: `security`
- Default severity: `info`

Summarizes prompt injection audit scope, scanned file count, finding count,
code-block scan mode, skipped files, and truncation status.

## Report Findings

These finding IDs describe command/report context rather than standalone lint
problems.

### `coverage.discovery_summary`

- Category: `coverage`
- Default severity: `info`
- Emitted by: `verify`

Summarizes how many `AGENTS.md` files were discovered and whether a root
`AGENTS.md` exists.

### `coverage.no_agents_file`

- Category: `coverage`
- Default severity: `warning`
- Emitted by: `verify`

Reports that no `AGENTS.md` files were found in the repository scope.

### `coverage.root_agents_missing`

- Category: `coverage`
- Default severity: `warning`
- Emitted by: `verify`

Reports that scoped `AGENTS.md` files exist but the repository root does not
have a root `AGENTS.md`.

### `inheritance.applied_chain`

- Category: `inheritance`
- Default severity: `info`
- Emitted by: `explain`

Reports which `AGENTS.md` files apply to the requested target path, plus any
deterministic conflict notes. `explain --json` also includes `toolEvidence`
inside this finding's `details` so callers can see local evidence for Codex,
Cursor, Claude Code, GitHub Copilot, Gemini CLI, Windsurf, and Cline
instruction surfaces without treating that evidence as a runtime guarantee.

### `inheritance.instruction_graph_summary`

- Category: `inheritance`
- Default severity: `info`
- Config options: `severity`

Emitted by `verify` and `explain` when `instructionGraph.enabled` is true.
Summarizes instruction graph node, edge, diagnostic, and referenced-file counts.

### `inheritance.referenced_instruction_missing`

- Category: `inheritance`
- Default severity: `warning`
- Config options: `severity`

Reports instruction-like Markdown references that are missing, unreadable,
outside the repository, or symlinked. AGENTS.md Doctor does not traverse these
references.

Example finding:

```text
warning inheritance.referenced_instruction_missing AGENTS.md:12
AGENTS.md references a missing instruction file: docs/agent/testing.md.
```

### `inheritance.instruction_graph_cycle`

- Category: `inheritance`
- Default severity: `warning`
- Config options: `severity`

Reports cycles in opt-in referenced instruction files, such as
`AGENTS.md -> docs/agent/testing.md -> AGENTS.md`.

### `inheritance.instruction_graph_depth_exceeded`

- Category: `inheritance`
- Default severity: `warning`
- Config options: `severity`

Reports instruction references that were not traversed because they exceeded
`instructionGraph.maxDepth`.

### `inheritance.instruction_graph_budget_exceeded`

- Category: `inheritance`
- Default severity: `warning`
- Config options: `severity`

Reports opt-in instruction graph traversal that was stopped by a safety budget,
such as too many graph nodes, edges, or references from one instruction file.
The finding means AGENTS.md Doctor intentionally stopped expanding the graph
instead of reading an unbounded instruction reference set.
