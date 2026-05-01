# Rules

This catalog lists shipped AGENTS.md Doctor rules only.

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
