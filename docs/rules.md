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
deterministic conflict notes.

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
