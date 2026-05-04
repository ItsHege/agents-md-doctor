# CI Output Formats

AGENTS.md Doctor supports JSON, GitHub annotation, and SARIF output for `lint`
and `verify`.

Use JSON as the stable report contract:

```bash
npx agents-doctor@latest verify --json .
```

Use GitHub annotations when you want workflow annotations plus a human summary:

```bash
npx agents-doctor@latest verify --format github .
```

Use SARIF when your CI system ingests SARIF 2.1.0:

```bash
npx agents-doctor@latest verify --format sarif . > agents-doctor.sarif
```

See `github-annotations.yml` and `sarif-upload.yml` for minimal GitHub Actions
patterns.

