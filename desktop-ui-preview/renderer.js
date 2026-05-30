const state = {
  command: "verify",
  filter: "all",
  projectPath: "",
  report: null,
  runMeta: null,
  findings: []
};

const elements = {
  projectPath: document.querySelector("#project-path"),
  selectProject: document.querySelector("#select-project"),
  runCheck: document.querySelector("#run-check"),
  strictMode: document.querySelector("#strict-mode"),
  targetGroup: document.querySelector("#target-group"),
  targetPath: document.querySelector("#target-path"),
  reportTitle: document.querySelector("#report-title"),
  summaryPills: document.querySelector("#summary-pills"),
  emptyState: document.querySelector("#empty-state"),
  errorState: document.querySelector("#error-state"),
  errorMessage: document.querySelector("#error-message"),
  results: document.querySelector("#results"),
  issueState: document.querySelector("#issue-state"),
  issueTitle: document.querySelector("#issue-title"),
  issueCopy: document.querySelector("#issue-copy"),
  ledgerCommand: document.querySelector("#ledger-command"),
  ledgerRoot: document.querySelector("#ledger-root"),
  ledgerGenerated: document.querySelector("#ledger-generated"),
  ledgerExit: document.querySelector("#ledger-exit"),
  ledgerScanned: document.querySelector("#ledger-scanned"),
  ledgerFindings: document.querySelector("#ledger-findings"),
  ledgerFiles: document.querySelector("#ledger-files"),
  ledgerPipeline: document.querySelector("#ledger-pipeline"),
  explainView: document.querySelector("#explain-view"),
  explainTarget: document.querySelector("#explain-target"),
  explainChain: document.querySelector("#explain-chain"),
  explainToolEvidence: document.querySelector("#explain-tool-evidence"),
  explainConflicts: document.querySelector("#explain-conflicts"),
  severityFilters: document.querySelector("#severity-filters"),
  findingsPanel: document.querySelector("#findings-panel"),
  findingsBody: document.querySelector("#findings-body"),
  copyJson: document.querySelector("#copy-json")
};

document.querySelectorAll("[data-command]").forEach((button) => {
  button.addEventListener("click", () => {
    state.command = button.dataset.command;
    document.querySelectorAll("[data-command]").forEach((candidate) => {
      candidate.classList.toggle("active", candidate === button);
    });
    elements.targetGroup.classList.toggle("hidden", state.command !== "explain");
  });
});

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((candidate) => {
      candidate.classList.toggle("active", candidate === button);
    });
    renderFindings();
  });
});

elements.selectProject.addEventListener("click", async () => {
  const result = await window.agentsDoctor.selectProject();
  if (result.canceled) {
    return;
  }

  state.projectPath = result.path;
  elements.projectPath.value = result.path;
});

elements.runCheck.addEventListener("click", async () => {
  elements.runCheck.disabled = true;
  elements.runCheck.textContent = "Running...";

  try {
    const result = await window.agentsDoctor.runCheck({
      command: state.command,
      root: state.projectPath,
      targetPath: elements.targetPath.value,
      strict: elements.strictMode.checked
    });

    if (!result.ok) {
      renderError(result.error);
      return;
    }

    state.report = result.report;
    state.runMeta = isPlainObject(result.meta) ? result.meta : null;
    state.findings = result.report.findings;
    renderReport(result.report);
  } catch (error) {
    renderError(error instanceof Error ? error.message : "Unexpected UI failure.");
  } finally {
    elements.runCheck.disabled = false;
    elements.runCheck.textContent = "Run check";
  }
});

elements.copyJson.addEventListener("click", async () => {
  if (!state.report) {
    return;
  }

  try {
    const jsonText = `${JSON.stringify(state.report, null, 2)}\n`;
    const result = await window.agentsDoctor.copyText(jsonText);
    if (!result.ok) {
      throw new Error(result.error ?? "Clipboard write failed.");
    }
    window.__agentsDoctorLastCopiedJson = jsonText;
    window.__agentsDoctorCopyError = "";
    elements.copyJson.textContent = "Copied";
    window.setTimeout(() => {
      elements.copyJson.textContent = "Copy JSON";
    }, 1200);
  } catch (error) {
    window.__agentsDoctorCopyError = error instanceof Error ? error.message : String(error);
    elements.copyJson.textContent = "Copy failed";
  }
});

function renderReport(report) {
  elements.emptyState.classList.add("hidden");
  elements.errorState.classList.add("hidden");
  elements.results.classList.remove("hidden");
  elements.reportTitle.textContent = buildReportTitle(report);
  elements.summaryPills.innerHTML = [
    renderPill("error", `${report.summary.errorCount} errors`),
    renderPill("warning", `${report.summary.warningCount} warnings`),
    renderPill("info", `${report.summary.infoCount} info`)
  ].join("");
  renderIssueState(report);
  renderRunLedger(report);
  if (report.command === "explain") {
    elements.severityFilters.classList.add("hidden");
    elements.findingsPanel.classList.add("hidden");
    elements.explainView.classList.remove("hidden");
    renderExplainView(report);
  } else {
    elements.severityFilters.classList.remove("hidden");
    elements.explainView.classList.add("hidden");
    elements.findingsPanel.classList.remove("hidden");
    renderFindings();
  }
}

function renderError(message) {
  state.report = null;
  state.runMeta = null;
  state.findings = [];
  elements.emptyState.classList.add("hidden");
  elements.results.classList.add("hidden");
  elements.errorState.classList.remove("hidden");
  elements.explainView.classList.add("hidden");
  elements.severityFilters.classList.remove("hidden");
  elements.findingsPanel.classList.add("hidden");
  elements.reportTitle.textContent = "Run failed";
  elements.summaryPills.innerHTML = renderPill("error", "exit 2");
  elements.errorMessage.textContent = message;
}

function renderIssueState(report) {
  elements.issueState.classList.remove("warn", "fail");

  if (report.summary.errorCount > 0) {
    elements.issueState.classList.add("fail");
    elements.issueTitle.textContent = "Errors found";
    elements.issueCopy.textContent = "Fix the error findings before using this project as a clean instruction baseline.";
    return;
  }

  if (report.summary.warningCount > 0) {
    elements.issueState.classList.add("warn");
    elements.issueTitle.textContent = "Warnings found";
    elements.issueCopy.textContent = "Review warning findings and decide whether to fix instructions or add explicit config.";
    return;
  }

  elements.issueTitle.textContent = "No issues found";
  elements.issueCopy.textContent =
    report.findings.length > 0
      ? "Only informational findings were returned; no errors or warnings were found."
      : "The selected check completed without errors, warnings, or informational findings.";
}

function renderRunLedger(report) {
  const coverageFinding = report.findings.find((finding) => finding.ruleId === "coverage.discovery_summary");
  const coverageDetails = isPlainObject(coverageFinding?.details) ? coverageFinding.details : {};
  const agentsFileCount =
    typeof coverageDetails.agentsFileCount === "number" ? coverageDetails.agentsFileCount : undefined;
  const hasRootAgents = coverageDetails.hasRootAgents === true;
  const scannedFiles = Array.isArray(state.runMeta?.scannedFiles) ? state.runMeta.scannedFiles : [];
  const scannedCount = typeof agentsFileCount === "number" ? agentsFileCount : scannedFiles.length;

  elements.ledgerCommand.textContent = report.command;
  elements.ledgerRoot.textContent = report.root ?? state.projectPath;
  elements.ledgerRoot.title = report.root ?? state.projectPath;
  elements.ledgerGenerated.textContent = formatDateTime(report.generatedAt);
  elements.ledgerExit.textContent = String(report.exitCode);
  elements.ledgerScanned.textContent =
    scannedCount > 0 ? `${scannedCount} file${scannedCount === 1 ? "" : "s"}${hasRootAgents ? " incl. root" : ""}` : "-";
  elements.ledgerFindings.textContent = String(report.findings.length);
  elements.ledgerFiles.textContent = scannedFiles.length > 0 ? scannedFiles.join(", ") : "-";
  elements.ledgerFiles.title = scannedFiles.join(", ");
  renderPipeline(report.command);
}

function renderFindings() {
  const findings =
    state.filter === "all" ? state.findings : state.findings.filter((finding) => finding.severity === state.filter);

  elements.findingsBody.innerHTML = "";

  if (findings.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "No findings for this view.";
    row.append(cell);
    elements.findingsBody.append(row);
    return;
  }

  for (const finding of findings) {
    const row = document.createElement("tr");
    row.append(
      makeSeverityCell(finding.severity),
      makeTextCell(finding.ruleId, "rule-id"),
      makeTextCell(formatLocation(finding), "location"),
      makeTextCell(finding.message)
    );
    elements.findingsBody.append(row);
  }
}

function renderExplainView(report) {
  const finding = report.findings.find((candidate) => candidate.ruleId === "inheritance.applied_chain");
  const details = isPlainObject(finding?.details) ? finding.details : {};
  const targetPath = typeof details.targetPath === "string" ? details.targetPath : ".";
  const appliedFiles = Array.isArray(details.appliedFiles) ? details.appliedFiles.filter((file) => typeof file === "string") : [];
  const conflicts = Array.isArray(details.conflicts) ? details.conflicts.filter(isPlainObject) : [];
  const toolEvidence = Array.isArray(details.toolEvidence) ? details.toolEvidence.filter(isPlainObject) : [];

  elements.explainTarget.textContent = targetPath;
  elements.explainChain.innerHTML = "";

  if (appliedFiles.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No AGENTS.md files apply to this target.";
    elements.explainChain.append(item);
  } else {
    for (const [index, file] of appliedFiles.entries()) {
      const item = document.createElement("li");
      item.classList.toggle("nearest", index === appliedFiles.length - 1);
      item.textContent = index === appliedFiles.length - 1 ? `${file} (nearest)` : file;
      elements.explainChain.append(item);
    }
  }

  renderToolEvidence(toolEvidence);

  elements.explainConflicts.innerHTML = "";
  elements.explainConflicts.classList.toggle("hidden", conflicts.length === 0);

  for (const conflict of conflicts) {
    const item = document.createElement("div");
    item.className = "conflict-item";
    const conflictId = typeof conflict.conflictId === "string" ? conflict.conflictId : "conflict";
    const message = typeof conflict.message === "string" ? conflict.message : "Conflict note.";
    item.textContent = `${conflictId}: ${message}`;
    elements.explainConflicts.append(item);
  }
}

function renderToolEvidence(toolEvidence) {
  elements.explainToolEvidence.innerHTML = "";

  if (toolEvidence.length === 0) {
    elements.explainToolEvidence.classList.add("hidden");
    return;
  }

  elements.explainToolEvidence.classList.remove("hidden");

  const heading = document.createElement("span");
  heading.className = "section-label";
  heading.textContent = "Tool evidence";
  elements.explainToolEvidence.append(heading);

  for (const evidence of toolEvidence) {
    const item = document.createElement("div");
    item.className = "tool-evidence-item";
    const label = typeof evidence.label === "string" ? evidence.label : "Tool";
    const status =
      typeof evidence.discoveryStatus === "string" ? evidence.discoveryStatus.replace(/_/g, " ") : "unknown";
    const surface = typeof evidence.surface === "string" ? evidence.surface : "surface not specified";
    const matchedFiles = Array.isArray(evidence.matchedFiles)
      ? evidence.matchedFiles.filter((file) => typeof file === "string")
      : [];
    const limitations = Array.isArray(evidence.limitations)
      ? evidence.limitations.filter((limit) => typeof limit === "string")
      : [];

    const title = document.createElement("div");
    title.className = "tool-evidence-title";
    title.textContent = `${label}: ${status}`;

    const meta = document.createElement("div");
    meta.className = "tool-evidence-meta";
    meta.textContent = matchedFiles.length > 0 ? `${surface} | ${matchedFiles.join(", ")}` : surface;

    item.append(title, meta);

    if (limitations.length > 0) {
      const limits = document.createElement("div");
      limits.className = "tool-evidence-limits";
      limits.textContent = limitations.join(", ");
      item.append(limits);
    }

    elements.explainToolEvidence.append(item);
  }
}

function makeSeverityCell(severity) {
  const cell = document.createElement("td");
  const badge = document.createElement("span");
  badge.className = `severity ${severity}`;
  badge.textContent = severity;
  cell.append(badge);
  return cell;
}

function makeTextCell(text, className = "") {
  const cell = document.createElement("td");
  if (className) {
    cell.className = className;
  }
  cell.textContent = text ?? "";
  return cell;
}

function buildReportTitle(report) {
  if (report.exitCode === 1) {
    return `${capitalize(report.command)} needs attention`;
  }

  if (report.summary.errorCount === 0 && report.summary.warningCount === 0) {
    return `${capitalize(report.command)} passed`;
  }

  return `${capitalize(report.command)} completed`;
}

function renderPill(kind, text) {
  return `<span class="pill ${kind}">${escapeHtml(text)}</span>`;
}

function formatLocation(finding) {
  if (!finding.file) {
    return `line ${finding.line ?? 1}`;
  }

  return `${finding.file}:${finding.line ?? 1}`;
}

function capitalize(value) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function renderPipeline(command) {
  const labels = buildPipelineLabels(command);
  elements.ledgerPipeline.innerHTML = "";
  elements.ledgerPipeline.title = labels.join(", ");

  for (const label of labels) {
    const chip = document.createElement("span");
    chip.className = "check-chip";
    chip.textContent = label;
    elements.ledgerPipeline.append(chip);
  }
}

function buildPipelineLabels(command) {
  if (command === "verify") {
    return ["Lint rules", "Coverage", "Inheritance"];
  }

  if (command === "lint") {
    return ["Size", "Sections", "Paths", "Commands", "Safety"];
  }

  return ["Applied instructions", "Conflicts", "Inheritance"];
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return replacements[character];
  });
}

function formatDateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
