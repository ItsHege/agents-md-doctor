# Release Governance

This project has two public release surfaces:

- the `agents-doctor` npm package;
- the Windows desktop preview zip attached to tagged GitHub Releases.

Keep those surfaces separate. The npm package must stay narrow and validated by
`npm run smoke:pack`; the desktop zip is a GitHub Release asset and is not part
of the npm package.

## Current Release Path

The current release workflow is `.github/workflows/release.yml`.

It runs the release gate first:

1. `npm ci`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`
5. `npm run smoke`
6. `npm run smoke:pack`
7. `npm run benchmark`
8. `npm run release:preflight`
9. desktop UI dependency install, runtime safety scan, Electron smoke, and
   Windows zip packaging on tagged releases

The npm publish job currently uses the repository `NPM_TOKEN` secret plus
`npm publish --provenance --access public`. The job requests `id-token: write`
so npm provenance can bind the published package to the GitHub Actions build.

The GitHub Release job uploads only the desktop zip artifact and uses
`contents: write` only in that job.

## Trusted Publishing Target

npm trusted publishing is the preferred future target because it uses OIDC
instead of a long-lived npm automation token.

Do not change `.github/workflows/release.yml` to require trusted publishing
until the npm package settings are configured and a maintainer is ready to test
the next release.

Recommended npm package settings for `agents-doctor`:

- Publisher: GitHub Actions
- Organization or user: `ItsHege`
- Repository: `agents-md-doctor`
- Workflow filename: `release.yml`
- Allowed action: `npm publish`
- Environment name: leave blank unless GitHub environment protection is added

Migration sequence:

1. Add the trusted publisher on npmjs.com.
2. Keep the existing `NPM_TOKEN` path for one release candidate or dry release
   rehearsal so the release gate remains recoverable.
3. Update the publish job to use OIDC publishing without `NODE_AUTH_TOKEN`.
4. Publish one version through trusted publishing and verify npm provenance.
5. Remove the repository `NPM_TOKEN` secret after the trusted publish succeeds.
6. In npm package settings, restrict traditional token access only after the
   trusted publisher is proven.

Trusted publishing currently requires a supported hosted CI provider and a new
enough Node/npm runtime. Use an explicit modern Node version in the publish job
when migrating, and re-check npm's current trusted publishing docs before the
workflow change.

## Workflow Permissions

Use least privilege:

- default workflow permissions should stay `contents: read`;
- validation and dependency-review jobs should not request write permissions;
- npm publishing should request `id-token: write` and only the repository read
  permissions it needs;
- GitHub Release asset upload should keep `contents: write` isolated to the
  release-asset job;
- do not use `pull_request_target` for code checkout or release-sensitive work.

When a job-specific `permissions` block is added, unspecified permissions are
treated as no access by GitHub. Keep job blocks explicit.

## Action Pinning Policy

Release-sensitive workflows should use full-length commit SHA pins for external
actions. This currently applies to the release workflow because it can publish
packages and upload release assets.

Lower-risk CI workflows may use version tags when they run with read-only
permissions and no secrets. Dependabot is configured to open GitHub Actions
update PRs so those references remain visible and reviewable.

When updating an action used by the release workflow:

1. Check the upstream action repository and release notes.
2. Resolve the new full commit SHA from the upstream repository, not a fork.
3. Update the workflow pin.
4. Run CI and the release preflight locally where practical.
5. Confirm the next release run still validates npm package contents and desktop
   zip packaging before publishing.

## Review Policy

`.github/CODEOWNERS` marks release and supply-chain surfaces for maintainer
review. CODEOWNERS is advisory unless repository branch protection requires
CODEOWNER approval.

Protected surfaces include:

- `.github/workflows/`
- `.github/dependabot.yml`
- `package.json`
- `package-lock.json`
- `scripts/release-preflight.mjs`
- `tests/smoke/pack-smoke.mjs`
- desktop packaging and runtime safety scripts

Do not auto-merge dependency or workflow changes that touch those surfaces.

## Release Checklist

Before a public release:

1. Confirm package version, tag, changelog, and lockfile alignment.
2. Run typecheck, tests, build, smoke, pack smoke, benchmark, and release
   preflight.
3. Run desktop UI smoke and Windows packaging if uploading a desktop zip.
4. Inspect `npm pack --dry-run --json` or rely on `npm run smoke:pack`.
5. Verify the npm package version and provenance after publish.
6. Verify the GitHub Release zip asset name, size, digest, and download URL.
7. Keep any manual fallback publish clearly documented in the release notes or
   maintainer notes.

## References Checked

These references were checked on 2026-06-04 before adding this plan:

- npm trusted publishing for npm packages:
  https://docs.npmjs.com/trusted-publishers/
- npm provenance statements:
  https://docs.npmjs.com/generating-provenance-statements/
- GitHub Actions secure use reference:
  https://docs.github.com/en/actions/reference/security/secure-use
- GitHub Actions OIDC reference:
  https://docs.github.com/en/actions/reference/security/oidc
- GitHub Actions workflow permissions syntax:
  https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
