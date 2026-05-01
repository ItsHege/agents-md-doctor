# Contributing

Thanks for helping improve AGENTS.md Doctor.

## Local Setup

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run smoke
npm run smoke:pack
```

## Development Rules

- Keep behavior deterministic and CI-safe.
- Do not execute commands extracted from `AGENTS.md`.
- Keep JSON output stable unless schema changes are intentional and documented.
- Add tests for new rules and CLI behavior.

## Pull Request Checklist

1. Typecheck passes.
2. Tests pass.
3. Smoke tests pass.
4. README/docs reflect shipped behavior.
5. New rule id and severity are documented in `docs/rules.md`.
