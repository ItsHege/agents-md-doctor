# Minimal Repo

Copy `AGENTS.sample.md` to `AGENTS.md` in a small repository, then run:

```bash
npx agents-doctor@latest lint .
npx agents-doctor@latest verify --json .
```

Expected result: no missing Safety or Testing section finding, and no missing
script finding for `npm test` because `package.json` declares `test`.

