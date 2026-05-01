# Glossary

Shared terms for AGENTS.md Doctor.

## Actionable Error

A finding that tells the user what failed, where it failed, and what to change.

## Finding

One reported validation result from a rule. A finding should include rule id,
severity, message, file, and location when possible.

## MVP-Blocking

A problem that prevents the first useful release from reliably supporting the
core commands:

- `lint`
- `verify`
- `explain`

MVP-blocking issues include unsafe command execution, unstable JSON output,
missing tests for implemented rules, and CLI behavior that contradicts docs.

## Rule Id

A stable machine-readable identifier for a rule. Use `category.rule_name`
format.

The category namespace describes the problem type, not the CLI command that ran
the rule. Stable categories are:

- `structure`
- `size`
- `coverage`
- `commands`
- `paths`
- `inheritance`
- `security`

Examples:

- `size.file_too_long`
- `commands.mentioned_command_missing`
- `paths.reference_missing`
- `inheritance.conflict`

## Severity

The impact level of a finding:

- `error`: should fail CI by default.
- `warning`: should not fail CI unless strict mode is enabled.
- `info`: useful context that should not fail CI.

## Stable Output

Output that scripts, tests, and CI can rely on. JSON output is part of the
public contract and should not change without documentation.
