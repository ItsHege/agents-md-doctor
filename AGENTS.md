# AGENTS.md Doctor Agent Instructions

## Project Goal

Build a small, practical open-source CLI and CI tool that validates repository-level `AGENTS.md` files for AI coding agents.

The project should stay focused on three user outcomes:

- `lint`: instruction files are readable, scoped, and not bloated.
- `verify`: commands and paths in instructions match the real repo.
- `explain`: developers can see which instructions apply to a target file.

## Working Rules

- Keep the first implementation narrow and testable.
- Prefer deterministic parsing and repository inspection before any LLM-based analysis.
- Do not add network calls to the core validator.
- Do not auto-rewrite user instructions in the MVP.
- Treat CI output as a first-class use case.
- Every rule should have a stable rule id, severity, message, and location when possible.

## Safety Rules

- Never execute commands found inside `AGENTS.md` during verification.
- Only check whether referenced commands exist.
- Do not read secrets or environment values.
- Do not upload repository contents anywhere.
- Be careful with path traversal and symlinks when scanning repositories.

## Testing Expectations

- Add tests for every rule.
- Include fixtures for valid, invalid, nested, and monorepo-style projects.
- Verify that missing commands are detected without running them.
- Test conflict handling for parent and child `AGENTS.md` files.

## Documentation Expectations

- Keep README examples current with real CLI behavior.
- Document rule ids and output schema.
- Include short CI examples for GitHub Actions.

