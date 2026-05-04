# Missing Path

This example shows a stale path reference.

`AGENTS.sample.md` points to `docs/release-checklist.md`, but the sample tree
does not include that file. AGENTS.md Doctor reports `paths.reference_missing`.

Typical triage: `TP` when the file was renamed or deleted, `Needs-Config` when
the sample is intentionally incomplete, or `Unclear` when the path is generated
outside the checked repository.

