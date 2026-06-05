import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import electronPath from "electron";

const prototypeRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const workspaceRoot = path.resolve(prototypeRoot, "..");
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agents-doctor-ui-smoke-"));
const cleanRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agents-doctor-ui-clean-"));
const markerPath = path.join(fixtureRoot, "marker-created-by-command.txt");

try {
  fs.writeFileSync(path.join(fixtureRoot, "package.json"), JSON.stringify({ scripts: {} }));
  fs.writeFileSync(
    path.join(fixtureRoot, "AGENTS.md"),
    [
      "# Instructions",
      "",
      "## Safety",
      "",
      `Do not run this inline command: \`node -e "require('fs').writeFileSync(${JSON.stringify(markerPath)}, 'owned')"\`.`,
      "",
      "## Testing",
      "",
      "```bash",
      `node -e "require('fs').writeFileSync(${JSON.stringify(markerPath)}, 'owned')"`,
      "```"
    ].join("\n")
  );
  fs.mkdirSync(path.join(fixtureRoot, "notes"), { recursive: true });
  const oldPlanPath = path.join(fixtureRoot, "notes", "old-plan.md");
  fs.writeFileSync(oldPlanPath, "# v0.9 Plan\n\nNext steps.\n");
  const oldPlanDate = new Date(Date.now() - 31 * 86_400_000);
  fs.utimesSync(oldPlanPath, oldPlanDate, oldPlanDate);
  fs.mkdirSync(path.join(cleanRoot, "packages", "app"), { recursive: true });
  fs.writeFileSync(path.join(cleanRoot, "package.json"), JSON.stringify({ scripts: {} }));
  fs.writeFileSync(
    path.join(cleanRoot, "AGENTS.md"),
    [
      "# Root Instructions",
      "",
      "## Safety",
      "",
      "Keep checks deterministic.",
      "",
      "## Testing",
      "",
      "Use the repository test suite."
    ].join("\n")
  );
  fs.writeFileSync(
    path.join(cleanRoot, "packages", "app", "AGENTS.md"),
    [
      "# App Instructions",
      "",
      "## Safety",
      "",
      "Keep app changes local.",
      "",
      "## Testing",
      "",
      "Use focused app tests."
    ].join("\n")
  );
  fs.writeFileSync(path.join(cleanRoot, "packages", "app", "README.md"), "# App\n");
  fs.mkdirSync(path.join(cleanRoot, ".claude", "commands", "team"), { recursive: true });
  fs.mkdirSync(path.join(cleanRoot, ".github", "instructions"), { recursive: true });
  fs.mkdirSync(path.join(cleanRoot, ".gemini"), { recursive: true });
  fs.mkdirSync(path.join(cleanRoot, ".windsurf", "rules"), { recursive: true });
  fs.mkdirSync(path.join(cleanRoot, ".clinerules"), { recursive: true });
  fs.writeFileSync(
    path.join(cleanRoot, "CLAUDE.md"),
    [
      "# Claude Code",
      "",
      "Load @AGENTS.md and @missing.md before scoped work.",
      "Use /project:team/review and /project:missing-command for review handoffs."
    ].join("\n")
  );
  fs.writeFileSync(path.join(cleanRoot, ".claude", "commands", "team", "review.md"), "# Review\n");
  fs.writeFileSync(path.join(cleanRoot, ".claude", "settings.json"), JSON.stringify({ permissions: {} }));
  fs.writeFileSync(path.join(cleanRoot, ".github", "copilot-instructions.md"), "# Copilot\n");
  fs.writeFileSync(path.join(cleanRoot, ".github", "instructions", "typescript.instructions.md"), "# TypeScript\n");
  fs.writeFileSync(path.join(cleanRoot, "GEMINI.md"), "# Root Gemini\n");
  fs.writeFileSync(path.join(cleanRoot, "packages", "app", "GEMINI.md"), "# App Gemini\n");
  fs.writeFileSync(path.join(cleanRoot, ".gemini", "settings.json"), JSON.stringify({ context: { fileName: "GEMINI.md" } }));
  fs.writeFileSync(path.join(cleanRoot, ".windsurf", "rules", "style.md"), "# Windsurf\n");
  fs.writeFileSync(path.join(cleanRoot, ".windsurfrules"), "# Windsurf legacy\n");
  fs.writeFileSync(path.join(cleanRoot, ".clinerules", "workflow.md"), "# Cline\n");

  const electronArgs = process.platform === "linux" ? ["--no-sandbox", prototypeRoot] : [prototypeRoot];
  const result = spawnSync(electronPath, electronArgs, {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      AGENTS_DOCTOR_UI_SMOKE: "1",
      AGENTS_DOCTOR_UI_SMOKE_ROOT: fixtureRoot,
      AGENTS_DOCTOR_UI_SMOKE_CLEAN_ROOT: cleanRoot,
      AGENTS_DOCTOR_UI_SMOKE_MARKER: markerPath
    },
    timeout: 30000
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      [
        `Electron smoke failed with exit ${result.status}.`,
        result.stdout.trim() ? `STDOUT:\n${result.stdout.trim()}` : "",
        result.stderr.trim() ? `STDERR:\n${result.stderr.trim()}` : ""
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  if (fs.existsSync(markerPath)) {
    throw new Error("Electron smoke executed a command from AGENTS.md.");
  }

  const smokeOutput = parseLastJsonLine(result.stdout);

  if (smokeOutput.command !== "verify") {
    throw new Error(`Expected verify report, got ${smokeOutput.command}.`);
  }

  if (smokeOutput.selectedPath !== fixtureRoot) {
    throw new Error(`Expected folder picker smoke path ${fixtureRoot}, got ${smokeOutput.selectedPath}.`);
  }

  if (typeof smokeOutput.findingCount !== "number" || smokeOutput.findingCount < 1) {
    throw new Error("Expected at least one rendered finding.");
  }

  if (!String(smokeOutput.title).includes("Verify")) {
    throw new Error(`Expected report title to mention Verify, got ${smokeOutput.title}.`);
  }

  if (smokeOutput.ledgerCommand !== "verify") {
    throw new Error(`Expected run ledger command verify, got ${smokeOutput.ledgerCommand}.`);
  }

  if (!String(smokeOutput.ledgerScanned).includes("1 file")) {
    throw new Error(`Expected run ledger scanned count, got ${smokeOutput.ledgerScanned}.`);
  }

  if (smokeOutput.ledgerFindings !== String(smokeOutput.findingCount)) {
    throw new Error(
      `Expected run ledger findings count ${smokeOutput.findingCount}, got ${smokeOutput.ledgerFindings}.`
    );
  }

  if (!String(smokeOutput.ledgerFiles).includes("AGENTS.md")) {
    throw new Error(`Expected run ledger scanned files to include AGENTS.md, got ${smokeOutput.ledgerFiles}.`);
  }

  if (!Array.isArray(smokeOutput.ledgerPipeline) || !smokeOutput.ledgerPipeline.includes("Coverage")) {
    throw new Error(`Expected verify pipeline to include Coverage, got ${smokeOutput.ledgerPipeline}.`);
  }

  if (!smokeOutput.ledgerPipeline.includes("Context hygiene")) {
    throw new Error(`Expected verify pipeline to include Context hygiene, got ${smokeOutput.ledgerPipeline}.`);
  }

  if (typeof smokeOutput.copiedCleanup !== "string" || !smokeOutput.copiedCleanup.includes("archive or delete")) {
    throw new Error("Expected context finding drawer to copy cleanup request.");
  }

  if (typeof smokeOutput.reviewedFindingCount !== "number" || smokeOutput.reviewedFindingCount < 1) {
    throw new Error("Expected desktop UI to save and reapply at least one reviewed finding.");
  }

  if (!Array.isArray(smokeOutput.ignoredRows) || !smokeOutput.ignoredRows.some((row) => row.includes("ignored"))) {
    throw new Error(`Expected ignored filter to render reviewed findings, got ${smokeOutput.ignoredRows}.`);
  }

  if (smokeOutput.restoredReviewedFindingCount !== 0) {
    throw new Error(`Expected restored ignored finding count 0, got ${smokeOutput.restoredReviewedFindingCount}.`);
  }

  if (Number(smokeOutput.restoredWarningCount) < 1 || smokeOutput.ignoredCountAfterRestore !== "0") {
    throw new Error(
      `Expected ignored finding to return to warnings after restore; warnings=${smokeOutput.restoredWarningCount}, ignored=${smokeOutput.ignoredCountAfterRestore}.`
    );
  }

  if (!String(smokeOutput.cleanTitle).includes("Lint")) {
    throw new Error(`Expected clean lint title, got ${smokeOutput.cleanTitle}.`);
  }

  if (smokeOutput.cleanIssueTitle !== "No issues found") {
    throw new Error(`Expected clean issue state, got ${smokeOutput.cleanIssueTitle}.`);
  }

  if (!String(smokeOutput.cleanScanned).includes("2 files")) {
    throw new Error(`Expected clean lint scanned count for nested fixture, got ${smokeOutput.cleanScanned}.`);
  }

  if (!Array.isArray(smokeOutput.cleanRows) || !smokeOutput.cleanRows.some((row) => row.includes("No findings"))) {
    throw new Error(`Expected clean lint to render no findings row, got ${smokeOutput.cleanRows}.`);
  }

  const copiedReport = JSON.parse(smokeOutput.copiedJson);
  if (copiedReport.command !== "lint" || !Array.isArray(copiedReport.findings) || copiedReport.findings.length !== 0) {
    throw new Error("Expected copied JSON to be the exact clean lint report.");
  }

  if (!String(smokeOutput.explainTitle).includes("Explain")) {
    throw new Error(`Expected explain title, got ${smokeOutput.explainTitle}.`);
  }

  if (smokeOutput.explainTarget !== "packages/app/README.md") {
    throw new Error(`Expected explain target path, got ${smokeOutput.explainTarget}.`);
  }

  if (!Array.isArray(smokeOutput.explainChain) || smokeOutput.explainChain.length !== 2) {
    throw new Error(`Expected two-file explain chain, got ${smokeOutput.explainChain}.`);
  }

  if (
    !Array.isArray(smokeOutput.explainToolEvidence) ||
    !smokeOutput.explainToolEvidence.some((item) => item.includes("Codex: native")) ||
    !smokeOutput.explainToolEvidence.some((item) => item.includes("Cursor: compatible")) ||
    !smokeOutput.explainToolEvidence.some(
      (item) =>
        item.includes("Claude Code: partial") &&
        item.includes("Settings: .claude/settings.json") &&
        item.includes("Commands: 1 file") &&
        item.includes("Imports:") &&
        item.includes("Slash commands:")
    ) ||
    !smokeOutput.explainToolEvidence.some((item) => item.includes("GitHub Copilot: partial")) ||
    !smokeOutput.explainToolEvidence.some((item) => item.includes("Gemini CLI: partial")) ||
    !smokeOutput.explainToolEvidence.some((item) => item.includes("Windsurf: partial")) ||
    !smokeOutput.explainToolEvidence.some((item) => item.includes("Cline: partial"))
  ) {
    throw new Error(`Expected explain tool evidence to render, got ${smokeOutput.explainToolEvidence}.`);
  }

  if (smokeOutput.explainVisible !== true || smokeOutput.findingsPanelHidden !== true) {
    throw new Error("Expected explain view to render instead of the findings table.");
  }

  if (smokeOutput.severityFiltersHidden !== true || smokeOutput.copyJsonVisible !== true) {
    throw new Error("Expected explain view to hide severity filters while keeping Copy JSON visible.");
  }

  const copiedExplainReport = JSON.parse(smokeOutput.copiedExplainJson);
  if (copiedExplainReport.command !== "explain") {
    throw new Error("Expected Copy JSON to copy the exact explain report.");
  }

  const copiedToolEvidence = copiedExplainReport.findings?.[0]?.details?.toolEvidence;
  const copiedToolIds = Array.isArray(copiedToolEvidence) ? copiedToolEvidence.map((entry) => entry.toolId) : [];
  for (const toolId of ["codex", "cursor", "claude-code", "github-copilot", "gemini-cli", "windsurf", "cline"]) {
    if (!copiedToolIds.includes(toolId)) {
      throw new Error(`Expected copied explain JSON to include ${toolId} tool evidence.`);
    }
  }
  if (!copiedToolEvidence.some((entry) => entry.toolId === "github-copilot" && entry.discoveryStatus === "partial")) {
    throw new Error("Expected copied explain JSON to preserve V2 tool evidence statuses.");
  }

  if (
    typeof smokeOutput.copiedHandoff !== "string" ||
    !smokeOutput.copiedHandoff.includes("Use this AGENTS.md Doctor report to fix instruction drift.") ||
    !smokeOutput.copiedHandoff.includes("Do not change unrelated files.") ||
    !smokeOutput.copiedHandoff.includes('"command": "explain"') ||
    !smokeOutput.copiedHandoff.includes('"github-copilot"')
  ) {
    throw new Error("Expected Copy handoff to include safe instructions and the exact explain JSON report.");
  }

  if (smokeOutput.invalidExitCode !== 2) {
    throw new Error(`Expected invalid root to return exit 2, got ${smokeOutput.invalidExitCode}.`);
  }

  if (smokeOutput.errorTitle !== "Run failed" || smokeOutput.errorVisible !== true) {
    throw new Error("Expected invalid root to render the error state.");
  }

  if (typeof smokeOutput.errorMessage !== "string" || smokeOutput.errorMessage.length === 0) {
    throw new Error("Expected invalid root to render an error message.");
  }

  console.log("Desktop UI smoke passed.");
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  fs.rmSync(cleanRoot, { recursive: true, force: true });
}

function parseLastJsonLine(stdout) {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{") && line.endsWith("}"));

  const lastLine = lines.at(-1);

  if (!lastLine) {
    throw new Error(`Expected JSON smoke output.\nSTDOUT:\n${stdout}`);
  }

  return JSON.parse(lastLine);
}
