# Configuration

AGENTS.md Doctor reads `.agents-doctor.json` from the repository root.
Missing config is valid and uses defaults.

## Example

```json
{
  "ignore": ["tests/fixtures/**"],
  "maxLines": 500,
  "failOnWarning": false,
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
- `maxLines`: default line threshold for `size.file_too_long`.
- `failOnWarning`: makes warnings produce exit code `1`.
- `rules`: per-rule options and severity overrides.
- `instructionGraph.enabled`: opt-in instruction graph traversal for `verify` and `explain`.
- `instructionGraph.maxDepth`: traversal depth from discovered or applied `AGENTS.md` files, from `0` to `10`.
- `instructionGraph.include`: repo-relative glob allowlist for referenced instruction files.

Rule severity can be `error`, `warning`, `info`, or `off`.

CLI flags override matching config values for ignore patterns, max-line
thresholds, and warning failure behavior.

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

## Instruction Graph Defaults

Instruction graph traversal is disabled by default to avoid surprising users
with findings from documentation fragments.

When enabled, AGENTS.md Doctor follows only explicit local Markdown links and
inline-code references that look like agent instruction files. It does not scan
all documentation, follow remote URLs, follow symlinks, or read outside the
repository boundary.
