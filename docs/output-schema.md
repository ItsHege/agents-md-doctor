# Output Schema

AGENTS.md Doctor uses separate schemas for rule metadata, runtime findings, and
run reports.

## RuleDefinition

Static metadata for a validation rule.

- `id`: stable rule id in `category.rule_name` format.
- `category`: one of `structure`, `size`, `coverage`, `commands`, `paths`,
  `inheritance`, `security`, `context`, or `runtime`.
- `defaultSeverity`: `error`, `warning`, or `info`.
- `title`: short human-readable rule name.
- `description`: what the rule detects.
- `docsUrl`: optional public documentation URL.

The `category` value must match the prefix of `id`.

## Finding

Runtime result produced by a rule.

- `ruleId`: stable rule id.
- `severity`: `error`, `warning`, or `info`.
- `message`: actionable message.
- `file`: optional repository-relative file path.
- `line`: optional 1-based line number.
- `column`: optional 1-based column number.
- `details`: optional machine-readable metadata.

AGENTS.md Doctor attaches `details.fingerprint` to findings so a repository can
mark a specific finding as reviewed in `.agents-doctor.json`. When a finding
matches `reviewedFindings`, its severity is downgraded to `info` and the report
adds `details.reviewedFinding` with the fingerprint, status, and optional note.
This is additive and keeps the top-level report schema at `1.0.0`.

## Report

Machine-readable output for a CLI run.

Successful JSON output is written to stdout only. Usage, config, and runtime
failures are written to stderr and are not JSON reports.

```json
{
  "schemaVersion": "1.0.0",
  "tool": "agents-doctor",
  "command": "lint",
  "generatedAt": "2026-04-30T19:30:00.000Z",
  "root": "C:/repo",
  "exitCode": 0,
  "summary": {
    "errorCount": 0,
    "warningCount": 1,
    "infoCount": 0
  },
  "findings": [
    {
      "ruleId": "size.file_too_long",
      "severity": "warning",
      "message": "AGENTS.md has 501 lines. Recommended maximum: 500 lines.",
      "file": "AGENTS.md",
      "line": 1,
      "details": {
        "fingerprint": "adf_v1_8e5f5dbff1a14b5f2f2aa24b",
        "lineCount": 501,
        "thresholdLines": 500,
        "unit": "lines"
      }
    }
  ]
}
```

Example reviewed finding details:

```json
{
  "fingerprint": "adf_v1_8e5f5dbff1a14b5f2f2aa24b",
  "reviewedFinding": {
    "fingerprint": "adf_v1_8e5f5dbff1a14b5f2f2aa24b",
    "status": "intentional",
    "note": "Historical evidence snapshot kept intentionally."
  }
}
```

Exit codes:

- `0`: no error findings, and no warning failure unless strict mode is enabled.
- `1`: one or more error-severity findings, or warning findings when strict
  mode is enabled.
- `2`: usage, config, or runtime failure.

Strict mode changes only the report `exitCode`; it does not change
`findings[].severity`.

## Output Formats

`lint` and `verify` support these output selectors:

- default human output;
- `--json`, equivalent to `--format json`;
- `--format github`, which emits GitHub workflow annotations plus a human
  summary; annotation lines can be reduced with
  `--annotations-min-severity <info|warning|error>` without changing the
  report or summary;
- `--format sarif`, which emits SARIF 2.1.0.

When both `--json` and `--format` are provided, JSON report output wins.

`explain` currently supports default human output and `--json`.

The JSON `Report` schema above remains the stable AGENTS.md Doctor report
schema. SARIF output follows the SARIF 2.1.0 shape and maps AGENTS.md Doctor
finding severities as `error`, `warning`, or `note`.

GitHub annotation filtering is a renderer option only. It does not remove
findings from the JSON report, SARIF output, human summary, or exit-code
calculation.

## Context Hygiene Details

`verify --context-hygiene` and `contextHygiene.enabled` use normal additive
findings under the existing top-level `schemaVersion: "1.0.0"` report schema.

Context hygiene details can include:

```json
{
  "matchedSignals": ["plan", "Next steps"],
  "ageDays": 83,
  "staleAfterDays": 60,
  "relatedFiles": ["notes/old-plan.md"],
  "matchedTokens": ["v0.9"],
  "suggestedAction": "archive",
  "cleanupRequest": "Review and archive or delete stale planning notes..."
}
```

`context.planning_summary.details` includes scan counts such as
`markdownFileCount`, `planningFileCount`, `truncated`, and `skippedFiles`.

`suggestedAction` is advisory and currently uses values such as `archive` or
`review`. AGENTS.md Doctor never deletes, moves, archives, rewrites, or
executes files during this audit.

## Prompt Injection Details

`verify --prompt-injection` and `promptInjection.enabled` use normal additive
findings under the existing top-level `schemaVersion: "1.0.0"` report schema.

Prompt injection details can include:

```json
{
  "signalId": "ignore_higher_priority_instructions",
  "patternId": "ignore_higher_priority_instructions",
  "riskKind": "instruction_override",
  "matchedText": "Ignore all previous system instructions",
  "matchedTextKind": "prose",
  "instructionSurface": "AGENTS.md",
  "confidence": "high",
  "scanCodeBlocks": false,
  "patternVersion": "prompt-injection-v1",
  "suggestedAction": "remove_or_rewrite",
  "cleanupRequest": "Review AGENTS.md:12. Remove or rewrite this prompt-injection style instruction..."
}
```

`security.prompt_injection_summary.details` includes scan counts such as
`markdownFileCount`, `scannedFileCount`, `findingCount`, `scanCodeBlocks`,
`truncated`, and `skippedFiles`.

## Instruction Graph Details

Instruction graph output is represented as normal findings with additive
`details` fields. The top-level report schema remains
`schemaVersion: "1.0.0"`.

When `instructionGraph.enabled` is true:

- `verify --json` can include `inheritance.instruction_graph_summary` and graph
  diagnostic findings.
- `explain --json` adds an `instructionGraph` object inside the existing
  `inheritance.applied_chain` finding details.
- referenced instruction file findings can include provenance fields such as
  `fileClass`, `graphDepth`, and `referencedBy`.

Example `inheritance.applied_chain` details:

```json
{
  "targetPath": "packages/app/src/index.ts",
  "toolProfile": "auto",
  "appliedFiles": ["AGENTS.md", "packages/app/AGENTS.md"],
  "conflicts": [],
  "toolEvidence": [
    {
      "toolId": "codex",
      "label": "Codex",
      "discoveryStatus": "native",
      "surface": "AGENTS.md ancestry",
      "checkedSurfaces": ["AGENTS.md ancestry"],
      "matchedFiles": ["AGENTS.md", "packages/app/AGENTS.md"],
      "limitations": []
    },
    {
      "toolId": "cursor",
      "label": "Cursor",
      "discoveryStatus": "compatible",
      "surface": "AGENTS.md compatibility signal",
      "checkedSurfaces": [".cursor/rules/**/*.mdc", ".cursorrules", "AGENTS.md ancestry"],
      "matchedFiles": ["AGENTS.md", "packages/app/AGENTS.md"],
      "limitations": [
        "cursor-native-rules-not-found",
        "cursor-agents-md-runtime-semantics-not-attested"
      ]
    }
  ],
  "instructionGraph": {
    "referencedInstructionFiles": ["docs/agent/testing.md"],
    "instructionEdges": [
      {
        "from": "AGENTS.md",
        "to": "docs/agent/testing.md",
        "reference": "docs/agent/testing.md",
        "line": 12,
        "sourceType": "link"
      }
    ],
    "graphDiagnostics": []
  }
}
```

## Tool Evidence Details

`explain --json` includes `toolEvidence` inside the
`inheritance.applied_chain` finding details. This is a deterministic local
repository inventory. It is not a runtime attestation that an external tool
loaded the same bytes or interpreted them with identical semantics.

The `inheritance.applied_chain.details` object is schema-checked before report
rendering. Additions remain additive under the existing top-level
`schemaVersion: "1.0.0"` compatibility boundary.

When a specific `--profile` is selected, `details.toolProfile` records that
profile and `details.toolEvidence` is filtered to the selected tool. With the
default `auto` profile, all supported tool-evidence entries are included.

Each entry has:

- `toolId`: stable machine id. Current values are `codex`, `cursor`,
  `claude-code`, `github-copilot`, `gemini-cli`, `windsurf`, and `cline`.
- `label`: display name for humans.
- `discoveryStatus`: one of:
  - `native`: AGENTS.md Doctor modeled a native local discovery surface for the
    target path.
  - `compatible`: a shared/portable instruction surface was found, but native
    runtime behavior is not attested.
  - `partial`: native tool-specific files were detected, but tool-specific
    activation, imports, globs, or memory semantics are not fully modeled.
  - `detected_not_modeled`: files were detected for a future surface, but this
    version does not interpret them.
  - `not_found`: no matching local surface was found for that tool.
- `surface`: short human-readable description of the evidence surface.
- `checkedSurfaces`: path names or glob-like locations checked locally.
- `matchedFiles`: repository-relative files that matched the checked surfaces.
- `limitations`: stable machine-readable caveats.
- `details`: optional tool-specific local inventory. This is additive and
  should be treated as evidence, not runtime attestation.

Current behavior:

- Codex evidence is based on the target path's `AGENTS.md` ancestry chain.
- Cursor evidence detects `.cursor/rules/**/*.mdc` and legacy `.cursorrules`.
  If no Cursor-native rules are found but `AGENTS.md` applies, the entry is
  marked `compatible`, not `native`.
- Claude Code evidence detects `CLAUDE.md` files in the target ancestry,
  `.claude/**/*.md` files, `.claude/commands/**/*.md`, and the existence of
  repo-local `.claude/settings.json`. It can include `details.settingsFiles`,
  `details.commandFiles`, `details.importReferences`, and
  `details.slashCommandReferences`. Import references and slash-command
  references are local inventory records only; imported file contents,
  settings values, hooks, permissions, MCP config, and runtime loading are not
  interpreted.
- GitHub Copilot evidence detects `.github/copilot-instructions.md` and
  `.github/instructions/**/*.instructions.md`. If those files are not found but
  `AGENTS.md` applies, the entry is marked `compatible` with runtime caveats.
- Gemini CLI evidence detects `GEMINI.md` files in the target ancestry and the
  in-repository `.gemini/settings.json` config surface. Settings values,
  imports, subdirectory scans, global memory, and runtime loading are not
  interpreted.
- Windsurf evidence detects `.windsurf/rules/**/*.md`. If no Windsurf rule file
  is found but `AGENTS.md` applies, the entry is marked `compatible` with
  runtime caveats.
- Cline evidence detects `.clinerules/**/*.{md,txt}`, `.cursorrules`, and
  `.windsurfrules`. If no Cline-native or legacy rule file is found but
  `AGENTS.md` applies, the entry is marked `compatible` with runtime caveats.

Example `inheritance.instruction_graph_summary` details:

```json
{
  "entryFiles": ["AGENTS.md"],
  "nodeCount": 2,
  "edgeCount": 1,
  "diagnosticCount": 0,
  "referencedInstructionFiles": ["docs/agent/testing.md"]
}
```

Example graph diagnostic details:

```json
{
  "code": "instruction_reference_missing",
  "reference": "docs/agent/missing.md",
  "target": "docs/agent/missing.md"
}
```

Graph diagnostics can also report safety-budget stops, for example:

```json
{
  "code": "instruction_graph_budget_exceeded",
  "reason": "max_references",
  "target": "AGENTS.md",
  "maxReferencesPerFile": 200
}
```

Example referenced instruction provenance:

```json
{
  "fileClass": "referencedInstruction",
  "graphDepth": 1,
  "referencedBy": "AGENTS.md"
}
```
