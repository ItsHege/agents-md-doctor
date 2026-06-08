import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/index.js";
import { checkContextHygiene } from "../../src/rules/context-hygiene.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("checkContextHygiene", () => {
  it("reports stale planning files with cleanup handoff details", () => {
    const root = makeTempRoot();
    writeFile(root, "notes/release-plan.md", "# v0.9 Plan\n\n## Next steps\n\nTODO: finish cleanup.\n");
    makeOld(root, "notes/release-plan.md", 83);

    const findings = runContext(root, { staleAfterDays: 60 });
    const stale = findings.find((finding) => finding.ruleId === "context.stale_plan_file");

    expect(stale).toMatchObject({
      severity: "warning",
      file: "notes/release-plan.md",
      details: {
        ageDays: 83,
        staleAfterDays: 60,
        suggestedAction: "archive"
      }
    });
    expect(stale?.details?.cleanupRequest).toContain("archive or delete");
    expect(stale?.details?.matchedSignals).toEqual(expect.arrayContaining(["plan", "Next steps", "TODO"]));
  });

  it("reports exact overlaps without fuzzy matching", () => {
    const root = makeTempRoot();
    writeFile(root, "notes/client-plan.md", "# Payment Flow\n\nNext steps for payment-flow-rollout in v0.9.\n");
    writeFile(root, "notes/payment-roadmap.md", "# Payment Flow\n\nDraft roadmap for payment-flow-rollout.\n");
    writeFile(root, "notes/payments.md", "# Payments\n\nDraft notes for card checkout.\n");

    const findings = runContext(root);
    const overlap = findings.find(
      (finding) =>
        finding.ruleId === "context.overlapping_plan_files" &&
        Array.isArray(finding.details?.matchedTokens) &&
        finding.details.matchedTokens.includes("payment-flow-rollout")
    );

    expect(overlap).toMatchObject({
      severity: "warning",
      details: {
        activeFileCount: 2,
        suggestedAction: "confirm_source_of_truth"
      }
    });
    expect(overlap?.details?.matchedTokens).toEqual(expect.arrayContaining(["payment-flow-rollout"]));
    expect(
      findings.some(
        (finding) =>
          finding.ruleId === "context.overlapping_plan_files" &&
          Array.isArray(finding.details?.relatedFiles) &&
          finding.details.relatedFiles.includes("notes/payments.md")
      )
    ).toBe(false);
  });

  it("aggregates multiple shared tokens into one overlap finding per file set", () => {
    const root = makeTempRoot();
    writeFile(
      root,
      "notes/client-plan.md",
      "# Payment Flow Rollout\n\nNext steps for payment-flow-rollout and billing-checkout-cleanup.\n"
    );
    writeFile(
      root,
      "notes/payment-roadmap.md",
      "# Payment Flow Rollout\n\nDraft roadmap for payment-flow-rollout and billing-checkout-cleanup.\n"
    );

    const findings = runContext(root);
    const overlaps = findings.filter((finding) => finding.ruleId === "context.overlapping_plan_files");

    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]?.details?.matchedTokens).toEqual(
      expect.arrayContaining(["billing-checkout-cleanup", "payment-flow-rollout", "payment flow rollout"])
    );
    expect(overlaps[0]?.details?.matchedTokenCount).toBe(3);
  });

  it("does not report overlap for date, metric, or numeric range tokens", () => {
    const root = makeTempRoot();
    writeFile(root, "notes/android-smoke-plan.md", "# Android Smoke\n\nRun 05-28 had metric 0.872 and range 1-20.\n");
    writeFile(root, "notes/android-survival-plan.md", "# Survival Profile\n\nRun 05-28 had metric 0.872 and range 1-20.\n");

    const findings = runContext(root);
    const overlapTokens = findings
      .filter((finding) => finding.ruleId === "context.overlapping_plan_files")
      .flatMap((finding) => (Array.isArray(finding.details?.matchedTokens) ? finding.details.matchedTokens : []));

    expect(overlapTokens).not.toEqual(expect.arrayContaining(["05-28", "0.872", "1-20"]));
  });

  it("does not report overlap for bare semver, UUID, or command-like tokens", () => {
    const root = makeTempRoot();
    const uuid = "a9acebb7-02b9-4b86-8d91-4eeecc9a069f";
    writeFile(root, "notes/one-plan.md", `# adb devices\n\nRuntime 17.0.18 used ${uuid}.\n`);
    writeFile(root, "notes/two-plan.md", `# adb devices\n\nRuntime 17.0.18 used ${uuid}.\n`);

    const findings = runContext(root);
    const overlapTokens = findings
      .filter((finding) => finding.ruleId === "context.overlapping_plan_files")
      .flatMap((finding) => (Array.isArray(finding.details?.matchedTokens) ? finding.details.matchedTokens : []));

    expect(overlapTokens).not.toEqual(expect.arrayContaining(["17.0.18", uuid, "adb devices"]));
  });

  it("keeps slug overlaps while filtering weak numeric tokens", () => {
    const root = makeTempRoot();
    writeFile(root, "notes/android-smoke-plan.md", "# Android Smoke\n\nTrack android-survival-profile after 05-28.\n");
    writeFile(root, "notes/android-survival-plan.md", "# Android Survival\n\nContinue android-survival-profile after 05-28.\n");

    const findings = runContext(root);
    const overlap = findings.find(
      (finding) =>
        finding.ruleId === "context.overlapping_plan_files" &&
        Array.isArray(finding.details?.matchedTokens) &&
        finding.details.matchedTokens.includes("android-survival-profile")
    );

    expect(overlap).toBeDefined();
    expect(overlap?.details?.matchedTokenKinds).toEqual(["slug"]);
  });

  it("does not report overlap for two-part weak slugs", () => {
    const root = makeTempRoot();
    writeFile(root, "notes/ui-one-plan.md", "# UI Plan\n\nTrack action-row and active-idle.\n");
    writeFile(root, "notes/ui-two-plan.md", "# UI Followup\n\nTrack action-row and active-idle.\n");

    const findings = runContext(root);
    const overlapTokens = findings
      .filter((finding) => finding.ruleId === "context.overlapping_plan_files")
      .flatMap((finding) => (Array.isArray(finding.details?.matchedTokens) ? finding.details.matchedTokens : []));

    expect(overlapTokens).not.toEqual(expect.arrayContaining(["action-row", "active-idle"]));
  });

  it("does not report overlap for generic headings or status/package slugs", () => {
    const root = makeTempRoot();
    writeFile(root, "notes/status-one-plan.md", "# Device\n\nTrack blocked-no-device and com-example-app-123456.\n");
    writeFile(root, "notes/status-two-plan.md", "# Device\n\nTrack blocked-no-device and com-example-app-123456.\n");

    const findings = runContext(root);
    const overlapTokens = findings
      .filter((finding) => finding.ruleId === "context.overlapping_plan_files")
      .flatMap((finding) => (Array.isArray(finding.details?.matchedTokens) ? finding.details.matchedTokens : []));

    expect(overlapTokens).not.toEqual(expect.arrayContaining(["device", "blocked-no-device", "com-example-app-123456"]));
  });

  it("does not report overlap for status vocabulary tokens", () => {
    const root = makeTempRoot();
    writeFile(root, "notes/android-one-plan.md", "# Android Plan\n\nTrack android-smoke-green and expected-vs-observed.\n");
    writeFile(root, "notes/android-two-plan.md", "# Android Followup\n\nTrack android-smoke-green and expected-vs-observed.\n");

    const findings = runContext(root);
    const overlapTokens = findings
      .filter((finding) => finding.ruleId === "context.overlapping_plan_files")
      .flatMap((finding) => (Array.isArray(finding.details?.matchedTokens) ? finding.details.matchedTokens : []));

    expect(overlapTokens).not.toEqual(expect.arrayContaining(["android-smoke-green", "expected-vs-observed"]));
  });

  it("does not report overlap for generated id slugs", () => {
    const root = makeTempRoot();
    writeFile(root, "notes/gemini-one-plan.md", "# Gemini Plan\n\nTrack gemini-code-1780598707702.\n");
    writeFile(root, "notes/gemini-two-plan.md", "# Gemini Followup\n\nTrack gemini-code-1780598707702.\n");

    const findings = runContext(root);
    const overlapTokens = findings
      .filter((finding) => finding.ruleId === "context.overlapping_plan_files")
      .flatMap((finding) => (Array.isArray(finding.details?.matchedTokens) ? finding.details.matchedTokens : []));

    expect(overlapTokens).not.toEqual(expect.arrayContaining(["gemini-code-1780598707702"]));
  });

  it("downgrades archive and snapshot overlaps to info with non-destructive cleanup wording", () => {
    const root = makeTempRoot();
    writeFile(
      root,
      "notes/archive/old-plan.md",
      "# Android Survival Profile 001\n\nHistorical android-survival-profile evidence.\n"
    );
    writeFile(
      root,
      "notes/snapshots/project_snapshot_20260510T121338Z.md",
      "# Android Survival Profile 001\n\nHistorical android-survival-profile evidence.\n"
    );

    const findings = runContext(root);
    const overlap = findings.find(
      (finding) =>
        finding.ruleId === "context.overlapping_plan_files" &&
        Array.isArray(finding.details?.matchedTokens) &&
        finding.details.matchedTokens.includes("android survival profile 001")
    );

    expect(overlap).toMatchObject({
      severity: "info",
      details: {
        contextKinds: ["archive", "snapshot"],
        activeFileCount: 0,
        suggestedAction: "mark_snapshot",
        latestCandidate: "notes/snapshots/project_snapshot_20260510T121338Z.md"
      }
    });
    expect(overlap?.details?.cleanupRequest).toContain("Do not delete evidence snapshots");
  });

  it("treats common historical directories as non-active context", () => {
    const root = makeTempRoot();
    writeFile(root, "notes/archives/old-plan.md", "# v0.9 Plan\n\nNext steps.\n");
    writeFile(root, "notes/snapshot/old-plan.md", "# v0.9 Plan\n\nNext steps.\n");
    writeFile(root, "notes/evidence/old-plan.md", "# v0.9 Plan\n\nNext steps.\n");
    makeOld(root, "notes/archives/old-plan.md", 90);
    makeOld(root, "notes/snapshot/old-plan.md", 90);
    makeOld(root, "notes/evidence/old-plan.md", 90);

    const findings = runContext(root);

    expect(findings.some((finding) => finding.ruleId === "context.stale_plan_file")).toBe(false);
    const publicFindings = findings.filter((finding) => finding.ruleId === "context.private_plan_in_public_scope");
    expect(publicFindings.every((finding) => finding.severity === "info")).toBe(true);
  });

  it("downgrades skill mirror overlaps to info", () => {
    const root = makeTempRoot();
    writeFile(
      root,
      "art_workspace/.codex/skills/ui/references/godot-ui-implementation-notes.md",
      "# 9-slice and UI Art Needs\n\nReference notes.\n"
    );
    writeFile(
      root,
      "game_workspace/.codex/skills/ui/references/godot-ui-implementation-notes.md",
      "# 9-slice and UI Art Needs\n\nReference notes.\n"
    );

    const findings = runContext(root);
    const overlap = findings.find(
      (finding) =>
        finding.ruleId === "context.overlapping_plan_files" &&
        Array.isArray(finding.details?.matchedTokens) &&
        finding.details.matchedTokens.includes("9-slice and ui art needs")
    );

    expect(overlap).toMatchObject({
      severity: "info",
      details: {
        contextKinds: ["skill_mirror"],
        suggestedAction: "mark_snapshot"
      }
    });
  });

  it("limits related files in overlap details", () => {
    const root = makeTempRoot();
    writeFile(root, "notes/root-plan.md", "# Root Plan\n\nTrack p0-source-settlement.\n");
    for (let index = 0; index < 12; index += 1) {
      writeFile(root, `notes/related-${index}-plan.md`, `# Related ${index}\n\nTrack p0-source-settlement.\n`);
    }

    const findings = runContext(root);
    const overlap = findings.find(
      (finding) =>
        finding.ruleId === "context.overlapping_plan_files" &&
        Array.isArray(finding.details?.matchedTokens) &&
        finding.details.matchedTokens.includes("p0-source-settlement")
    );

    expect(overlap?.details?.relatedFiles).toHaveLength(8);
    expect(overlap?.details).toMatchObject({
      relatedFileCount: 12,
      relatedFilesTruncated: true
    });
    expect(overlap?.details?.cleanupRequest).toContain("plus 4 more related files");
  });

  it("does not treat ordinary README next steps as planning clutter", () => {
    const root = makeTempRoot();
    writeFile(root, "README.md", "# Project\n\n## Next steps\n\nTODO: add more examples.\n");

    const findings = runContext(root);

    expect(findings.some((finding) => finding.file === "README.md" && finding.ruleId !== "context.planning_summary")).toBe(false);
  });

  it("does not treat durable release notes as planning clutter", () => {
    const root = makeTempRoot();
    writeFile(root, "docs/release-notes.md", "# Release Notes\n\n## v1.0\n\nNext steps are documented in the roadmap.\n");

    const findings = runContext(root);

    expect(findings.some((finding) => finding.file === "docs/release-notes.md")).toBe(false);
  });

  it("treats content-only files as planning only after multiple planning signals", () => {
    const root = makeTempRoot();
    writeFile(
      root,
      "docs/status.md",
      [
        "# Current Status",
        "",
        "WIP",
        "TODO: finish cleanup.",
        "Draft notes.",
        "Blocked on review.",
        "In progress",
        "Next steps"
      ].join("\n")
    );

    const findings = runContext(root);

    expect(findings.some((finding) => finding.file === "docs/status.md")).toBe(true);
  });

  it("does not treat status registry draft values as planning clutter", () => {
    const root = makeTempRoot();
    writeFile(
      root,
      "ASSET_REGISTRY.md",
      [
        "# Asset Registry",
        "",
        "Status vocabulary: draft = usable but expected to change.",
        "",
        "| id | status | owner |",
        "| --- | --- | --- |",
        "| dungeon-wall | draft | art |",
        "| stone-floor | draft | art |",
        "| iron-door | draft | art |",
        "| torch | draft | art |"
      ].join("\n")
    );

    const findings = runContext(root);

    expect(findings.some((finding) => finding.file === "ASSET_REGISTRY.md")).toBe(false);
  });

  it("ignores planning signals and overlap tokens inside code blocks", () => {
    const root = makeTempRoot();
    writeFile(
      root,
      "docs/ARCHITECTURE.md",
      [
        "# Architecture",
        "",
        "Implementation state enum:",
        "",
        "```ts",
        "export enum CellType {",
        "  BLOCKED = 'BLOCKED',",
        "  OPEN = 'OPEN'",
        "}",
        "```",
        "",
        "## Cell Types",
        "",
        "Architecture reference."
      ].join("\n")
    );
    writeFile(
      root,
      "docs/DUNGEON_LAYOUT.md",
      [
        "# Dungeon Layout",
        "",
        "Implementation state enum:",
        "",
        "```ts",
        "export enum CellType {",
        "  BLOCKED = 'BLOCKED',",
        "  OPEN = 'OPEN'",
        "}",
        "```",
        "",
        "## Cell Types",
        "",
        "Layout reference."
      ].join("\n")
    );

    const findings = runContext(root);

    expect(findings.some((finding) => finding.file === "docs/ARCHITECTURE.md")).toBe(false);
    expect(findings.some((finding) => finding.ruleId === "context.overlapping_plan_files")).toBe(false);
  });

  it("ignores weak overlap tokens and honors overlap token minimum length", () => {
    const root = makeTempRoot();
    writeFile(
      root,
      ".agents-doctor.json",
      JSON.stringify({
        contextHygiene: {
          overlapTokenMinLength: 6
        }
      })
    );
    writeFile(root, "notes/one-plan.md", "# Auth\n\nNext steps for ui.\n");
    writeFile(root, "notes/two-plan.md", "# Auth\n\nDraft notes for ui.\n");

    const findings = runContext(root);

    expect(findings.some((finding) => finding.ruleId === "context.overlapping_plan_files")).toBe(false);
  });

  it("reports planning notes in public scope and instruction surfaces", () => {
    const root = makeTempRoot();
    writeFile(root, "docs/roadmap.md", "# Roadmap\n\nDraft next public feature list.\n");
    writeFile(
      root,
      "AGENTS.md",
      [
        "# Instructions",
        "",
        "## Safety",
        "",
        "## Testing",
        "",
        "WIP",
        "TODO: clean old plans.",
        "Draft cleanup note.",
        "Blocked on review.",
        "In progress",
        "Next steps"
      ].join("\n")
    );

    const findings = runContext(root);
    const publicFindings = findings.filter((finding) => finding.ruleId === "context.private_plan_in_public_scope");

    expect(publicFindings.map((finding) => finding.file)).toEqual(expect.arrayContaining(["docs/roadmap.md", "AGENTS.md"]));
    expect(publicFindings[0]?.details?.suggestedAction).toBe("review");
  });

  it("respects context hygiene ignore patterns", () => {
    const root = makeTempRoot();
    writeFile(root, ".agents-doctor.json", JSON.stringify({ contextHygiene: { ignore: ["notes/archive/**"] } }));
    writeFile(root, "notes/archive/old-plan.md", "# v0.9 Plan\n\nNext steps.\n");
    writeFile(root, "notes/current-plan.md", "# v0.9 Plan\n\nNext steps.\n");

    const findings = runContext(root);

    expect(findings.some((finding) => finding.file === "notes/archive/old-plan.md")).toBe(false);
    expect(findings.some((finding) => finding.file === "notes/current-plan.md")).toBe(true);
  });

  it("skips symlinked markdown files", () => {
    const root = makeTempRoot();
    writeFile(root, "outside-plan.md", "# v0.9 Plan\n\nNext steps.\n");
    const linkPath = path.join(root, "notes", "linked-plan.md");
    fs.mkdirSync(path.dirname(linkPath), { recursive: true });

    try {
      fs.symlinkSync(path.join(root, "outside-plan.md"), linkPath);
    } catch {
      return;
    }

    const findings = runContext(root);

    expect(findings.some((finding) => finding.file === "notes/linked-plan.md")).toBe(false);
  });

  it("handles oversized markdown files without failing the audit", () => {
    const root = makeTempRoot();
    writeFile(root, ".agents-doctor.json", JSON.stringify({ contextHygiene: { maxFileSizeKb: 1 } }));
    writeFile(root, "notes/huge-plan.md", `# Huge Plan\n\n${"x".repeat(2048)}`);

    const findings = runContext(root);
    const summary = findings.find((finding) => finding.ruleId === "context.planning_summary");

    expect(summary?.details?.skippedFiles).toEqual(
      expect.arrayContaining([
        {
          file: "notes/huge-plan.md",
          reason: "E_FILE_TOO_LARGE"
        }
      ])
    );
  });

  it("stops at the configured max files scanned budget", () => {
    const root = makeTempRoot();
    writeFile(root, ".agents-doctor.json", JSON.stringify({ contextHygiene: { maxFilesScanned: 1 } }));
    writeFile(root, "notes/a-plan.md", "# v1.0 Plan\n\nNext steps.\n");
    writeFile(root, "notes/b-plan.md", "# v1.0 Plan\n\nNext steps.\n");

    const findings = runContext(root);
    const summary = findings.find((finding) => finding.ruleId === "context.planning_summary");

    expect(summary?.details).toMatchObject({
      markdownFileCount: 1,
      truncated: true
    });
  });
});

function runContext(root: string, overrides: { staleAfterDays?: number } = {}) {
  const config = loadConfig({ root });
  return checkContextHygiene({
    root,
    config: config.contextHygiene,
    now: new Date("2026-06-04T12:00:00.000Z"),
    ...overrides
  });
}

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-doctor-context-"));
  tempRoots.push(root);
  return root;
}

function writeFile(root: string, relativePath: string, content: string): void {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

function makeOld(root: string, relativePath: string, ageDays: number): void {
  const date = new Date(Date.parse("2026-06-04T12:00:00.000Z") - ageDays * 86_400_000);
  fs.utimesSync(path.join(root, relativePath), date, date);
}
