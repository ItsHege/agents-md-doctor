const state = {
  command: "verify",
  filter: "all",
  projectPath: "",
  targetPath: ".",
  report: null,
  previousReport: null,
  runMeta: null,
  findings: [],
  query: "",
  sortKey: "severity",
  sortDirection: "asc",
  selectedFinding: null,
  theme: "light",
  recentProjects: [],
  sidebarCollapsed: false
};

const elements = {
  appShell: document.querySelector(".app-shell"),
  sidebarToggle: document.querySelector("#sidebar-toggle"),
  projectPath: document.querySelector("#project-path"),
  recentProjects: document.querySelector("#recent-projects"),
  selectProject: document.querySelector("#select-project"),
  runCheck: document.querySelector("#run-check"),
  themeToggle: document.querySelector("#theme-toggle"),
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
  findingSearch: document.querySelector("#finding-search"),
  findingsPanel: document.querySelector("#findings-panel"),
  findingsBody: document.querySelector("#findings-body"),
  findingDrawer: document.querySelector("#finding-drawer"),
  drawerClose: document.querySelector("#drawer-close"),
  drawerTitle: document.querySelector("#drawer-title"),
  drawerMessage: document.querySelector("#drawer-message"),
  drawerActions: document.querySelector("#drawer-actions"),
  drawerJson: document.querySelector("#drawer-json"),
  saveReport: document.querySelector("#save-report"),
  copyJson: document.querySelector("#copy-json"),
  shortcutsOverlay: document.querySelector("#shortcuts-overlay"),
  shortcutsClose: document.querySelector("#shortcuts-close")
};

initialize();

async function initialize() {
  await loadPreferences();
  wireEvents();
  applyStateToControls();
}

async function loadPreferences() {
  const preferences = await window.agentsDoctor.loadPreferences();
  if (!isPlainObject(preferences)) {
    return;
  }

  state.theme = preferences.theme === "dark" ? "dark" : "light";
  state.command = ["verify", "lint", "explain"].includes(preferences.command) ? preferences.command : "verify";
  state.filter = ["all", "error", "warning", "info"].includes(preferences.filter) ? preferences.filter : "all";
  state.projectPath = typeof preferences.projectPath === "string" ? preferences.projectPath : "";
  state.targetPath = typeof preferences.targetPath === "string" ? preferences.targetPath : ".";
  state.recentProjects = Array.isArray(preferences.recentProjects) ? preferences.recentProjects.slice(0, 5) : [];
  state.sidebarCollapsed = preferences.sidebarCollapsed === true;
  elements.strictMode.checked = preferences.strict === true;
}

function wireEvents() {
  document.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => setCommand(button.dataset.command));
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => setFilter(button.dataset.filter));
  });

  document.querySelectorAll("[data-sort]").forEach((button) => {
    button.addEventListener("click", () => setSort(button.dataset.sort));
  });

  elements.selectProject.addEventListener("click", selectProject);
  elements.projectPath.addEventListener("change", validateTypedProjectPath);
  elements.projectPath.addEventListener("blur", validateTypedProjectPath);
  elements.recentProjects.addEventListener("change", () => {
    if (elements.recentProjects.value) {
      setProjectPath(elements.recentProjects.value);
    }
  });
  elements.targetPath.addEventListener("input", () => {
    state.targetPath = elements.targetPath.value;
    persistPreferences();
  });
  elements.strictMode.addEventListener("change", persistPreferences);
  elements.runCheck.addEventListener("click", runCheck);
  elements.themeToggle.addEventListener("click", toggleTheme);
  elements.sidebarToggle.addEventListener("click", toggleSidebar);
  elements.findingSearch.addEventListener("input", () => {
    state.query = elements.findingSearch.value.trim().toLowerCase();
    renderFindings();
  });
  elements.copyJson.addEventListener("click", copyJsonReport);
  elements.saveReport.addEventListener("click", saveReport);
  elements.drawerClose.addEventListener("click", closeDrawer);
  elements.shortcutsClose.addEventListener("click", closeShortcuts);
  elements.shortcutsOverlay.addEventListener("click", (event) => {
    if (event.target === elements.shortcutsOverlay) {
      closeShortcuts();
    }
  });

  document.addEventListener("keydown", handleShortcut);
  document.addEventListener("dragover", (event) => {
    event.preventDefault();
    document.body.classList.add("dragging");
  });
  document.addEventListener("dragleave", () => document.body.classList.remove("dragging"));
  document.addEventListener("drop", handleDrop);

  window.agentsDoctor.onAppCommand(handleAppCommand);
}

function applyStateToControls() {
  document.documentElement.dataset.theme = state.theme;
  elements.projectPath.value = state.projectPath;
  elements.targetPath.value = state.targetPath;
  elements.appShell.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  setCommand(state.command, { skipPersist: true });
  setFilter(state.filter, { skipPersist: true });
  renderRecentProjects();
}

function setCommand(command, options = {}) {
  if (!["verify", "lint", "explain"].includes(command)) {
    return;
  }

  state.command = command;
  document.querySelectorAll("[data-command]").forEach((candidate) => {
    candidate.classList.toggle("active", candidate.dataset.command === command);
  });
  elements.targetGroup.classList.toggle("hidden", state.command !== "explain");

  if (!options.skipPersist) {
    persistPreferences();
  }
}

function setFilter(filter, options = {}) {
  if (!["all", "error", "warning", "info"].includes(filter)) {
    return;
  }

  state.filter = filter;
  document.querySelectorAll("[data-filter]").forEach((candidate) => {
    candidate.classList.toggle("active", candidate.dataset.filter === filter);
  });
  renderFindings();

  if (!options.skipPersist) {
    persistPreferences();
  }
}

function setSort(sortKey) {
  if (state.sortKey === sortKey) {
    state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
  } else {
    state.sortKey = sortKey;
    state.sortDirection = "asc";
  }
  renderFindings();
}

async function selectProject() {
  const result = await window.agentsDoctor.selectProject();
  if (result.canceled) {
    return;
  }

  setProjectPath(result.path);
}

async function validateTypedProjectPath() {
  const nextPath = elements.projectPath.value.trim();
  if (!nextPath) {
    setProjectPath("");
    return;
  }

  const result = await window.agentsDoctor.validateProject(nextPath);
  if (!result.ok) {
    renderError(result.error);
    return;
  }

  setProjectPath(result.path);
}

function setProjectPath(projectPath) {
  state.projectPath = projectPath;
  elements.projectPath.value = projectPath;

  if (projectPath) {
    state.recentProjects = [projectPath, ...state.recentProjects.filter((entry) => entry !== projectPath)].slice(0, 5);
  }

  renderRecentProjects();
  persistPreferences();
}

async function runCheck() {
  elements.runCheck.disabled = true;
  elements.runCheck.classList.add("running");
  elements.runCheck.textContent = "Running...";
  const started = Date.now();

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

    state.previousReport = state.report;
    state.report = result.report;
    state.runMeta = isPlainObject(result.meta) ? result.meta : null;
    state.findings = result.report.findings;
    renderReport(result.report);
    maybeNotify(result.report, started);
  } catch (error) {
    renderError(error instanceof Error ? error.message : "Unexpected UI failure.");
  } finally {
    elements.runCheck.disabled = false;
    elements.runCheck.classList.remove("running");
    elements.runCheck.textContent = "Run check";
  }
}

async function copyJsonReport() {
  if (!state.report) {
    return;
  }

  await copyText(`${JSON.stringify(state.report, null, 2)}\n`, elements.copyJson, "Copy JSON");
}

async function saveReport() {
  if (!state.report) {
    return;
  }

  const content = `${JSON.stringify(state.report, null, 2)}\n`;
  const defaultName = `agents-doctor-${state.report.command}-${new Date().toISOString().slice(0, 10)}.json`;
  await window.agentsDoctor.saveReport({ content, defaultName });
}

async function copyText(text, button, resetText) {
  try {
    const result = await window.agentsDoctor.copyText(text);
    if (!result.ok) {
      throw new Error(result.error ?? "Clipboard write failed.");
    }
    window.__agentsDoctorLastCopiedJson = text;
    window.__agentsDoctorCopyError = "";
    button.textContent = "Copied";
  } catch (error) {
    window.__agentsDoctorCopyError = error instanceof Error ? error.message : String(error);
    button.textContent = "Copy failed";
  } finally {
    window.setTimeout(() => {
      button.textContent = resetText;
    }, 1400);
  }
}

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
  renderFilterCounts(report);
  closeDrawer();
  if (report.command === "explain") {
    elements.severityFilters.classList.add("hidden");
    elements.findingSearch.classList.add("hidden");
    elements.findingsPanel.classList.add("hidden");
    elements.explainView.classList.remove("hidden");
    renderExplainView(report);
  } else {
    elements.severityFilters.classList.remove("hidden");
    elements.findingSearch.classList.remove("hidden");
    elements.explainView.classList.add("hidden");
    elements.findingsPanel.classList.remove("hidden");
    renderFindings();
  }
}

function renderError(message) {
  state.report = null;
  state.runMeta = null;
  state.findings = [];
  closeDrawer();
  elements.emptyState.classList.add("hidden");
  elements.results.classList.add("hidden");
  elements.errorState.classList.remove("hidden");
  elements.explainView.classList.add("hidden");
  elements.severityFilters.classList.remove("hidden");
  elements.findingSearch.classList.add("hidden");
  elements.findingsPanel.classList.add("hidden");
  elements.reportTitle.textContent = "Run failed";
  elements.summaryPills.innerHTML = renderPill("error", "exit 2");
  elements.errorMessage.textContent = message;
}

function renderIssueState(report) {
  elements.issueState.classList.remove("warn", "fail");

  const diffText = renderDiffSummary(report);
  const suffix = diffText ? ` ${diffText}` : "";

  if (report.summary.errorCount > 0) {
    elements.issueState.classList.add("fail");
    elements.issueTitle.textContent = "Errors found";
    elements.issueCopy.textContent = `Fix the error findings before using this project as a clean instruction baseline.${suffix}`;
    return;
  }

  if (report.summary.warningCount > 0) {
    elements.issueState.classList.add("warn");
    elements.issueTitle.textContent = "Warnings found";
    elements.issueCopy.textContent = `Review warning findings and decide whether to fix instructions or add explicit config.${suffix}`;
    return;
  }

  elements.issueTitle.textContent = "No issues found";
  elements.issueCopy.textContent = `${
    report.findings.length > 0
      ? "Only informational findings were returned; no errors or warnings were found."
      : "The selected check completed without errors, warnings, or informational findings."
  }${suffix}`;
}

function renderDiffSummary(report) {
  if (!state.previousReport || state.previousReport.command !== report.command) {
    return "";
  }

  const errorDelta = report.summary.errorCount - state.previousReport.summary.errorCount;
  const warningDelta = report.summary.warningCount - state.previousReport.summary.warningCount;
  const pieces = [];
  if (errorDelta !== 0) {
    pieces.push(`${formatDelta(errorDelta)} errors`);
  }
  if (warningDelta !== 0) {
    pieces.push(`${formatDelta(warningDelta)} warnings`);
  }
  return pieces.length > 0 ? `Since previous run: ${pieces.join(", ")}.` : "No severity count changes since previous run.";
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

function renderFilterCounts(report) {
  const counts = {
    all: report.findings.length,
    error: report.summary.errorCount,
    warning: report.summary.warningCount,
    info: report.summary.infoCount
  };

  document.querySelectorAll("[data-filter]").forEach((button) => {
    const label = button.dataset.filter === "all" ? "All" : capitalize(`${button.dataset.filter}s`);
    button.textContent = `${label} ${counts[button.dataset.filter] ?? 0}`;
  });
}

function renderFindings() {
  const findings = getVisibleFindings();
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
    row.tabIndex = 0;
    row.addEventListener("click", () => openDrawer(finding));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        openDrawer(finding);
      }
    });
    row.append(
      makeSeverityCell(finding.severity),
      makeTextCell(finding.ruleId, "rule-id"),
      makeLocationCell(finding),
      makeTextCell(finding.message)
    );
    elements.findingsBody.append(row);
  }
}

function getVisibleFindings() {
  const filtered =
    state.filter === "all" ? state.findings : state.findings.filter((finding) => finding.severity === state.filter);
  const searched = state.query
    ? filtered.filter((finding) =>
        [finding.ruleId, finding.file, finding.message, finding.severity].join(" ").toLowerCase().includes(state.query)
      )
    : filtered;
  return [...searched].sort(compareFindings);
}

function compareFindings(left, right) {
  const multiplier = state.sortDirection === "asc" ? 1 : -1;
  const severityRank = { error: 0, warning: 1, info: 2 };
  const leftValue = state.sortKey === "severity" ? severityRank[left.severity] ?? 99 : sortValue(left, state.sortKey);
  const rightValue = state.sortKey === "severity" ? severityRank[right.severity] ?? 99 : sortValue(right, state.sortKey);
  return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true }) * multiplier;
}

function sortValue(finding, key) {
  if (key === "location") {
    return formatLocation(finding);
  }
  return finding[key] ?? "";
}

function openDrawer(finding) {
  state.selectedFinding = finding;
  elements.findingDrawer.classList.remove("hidden");
  elements.drawerTitle.textContent = `${finding.severity.toUpperCase()} ${finding.ruleId}`;
  elements.drawerMessage.textContent = finding.message;
  elements.drawerJson.textContent = JSON.stringify(finding, null, 2);
  elements.drawerActions.innerHTML = "";

  if (finding.file) {
    const openButton = document.createElement("button");
    openButton.className = "secondary-button";
    openButton.type = "button";
    openButton.textContent = "Open file";
    openButton.addEventListener("click", () => {
      window.agentsDoctor.openFile({
        root: state.report?.root ?? state.projectPath,
        file: finding.file,
        line: finding.line ?? 1
      });
    });
    elements.drawerActions.append(openButton);
  }

  const snippetButton = document.createElement("button");
  snippetButton.className = "secondary-button quiet";
  snippetButton.type = "button";
  snippetButton.textContent = "Copy config snippet";
  snippetButton.addEventListener("click", () => {
    const snippet = `${JSON.stringify({ rules: { [finding.ruleId]: { severity: "off" } } }, null, 2)}\n`;
    copyText(snippet, snippetButton, "Copy config snippet");
  });
  elements.drawerActions.append(snippetButton);
}

function closeDrawer() {
  state.selectedFinding = null;
  elements.findingDrawer.classList.add("hidden");
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
      item.innerHTML = `<span>${index + 1}</span><strong>${escapeHtml(file)}${
        index === appliedFiles.length - 1 ? " (nearest)" : ""
      }</strong>`;
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
    item.className = `tool-evidence-item ${evidence.discoveryStatus ?? ""}`;
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
  badge.textContent = `${severityIcon(severity)} ${severity}`;
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

function makeLocationCell(finding) {
  const cell = makeTextCell(formatLocation(finding), "location");
  if (finding.file) {
    cell.classList.add("clickable-location");
    cell.title = "Open finding details";
  }
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

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = state.theme;
  persistPreferences();
}

function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  elements.appShell.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  persistPreferences();
}

function renderRecentProjects() {
  elements.recentProjects.innerHTML = '<option value="">Recent projects</option>';
  elements.recentProjects.classList.toggle("hidden", state.recentProjects.length === 0);
  for (const project of state.recentProjects) {
    const option = document.createElement("option");
    option.value = project;
    option.textContent = project;
    elements.recentProjects.append(option);
  }
}

function handleShortcut(event) {
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === "o") {
    event.preventDefault();
    selectProject();
  } else if ((event.ctrlKey || event.metaKey) && key === "r") {
    event.preventDefault();
    runCheck();
  } else if (event.key === "F5") {
    event.preventDefault();
    runCheck();
  } else if ((event.ctrlKey || event.metaKey) && key === "1") {
    event.preventDefault();
    setCommand("verify");
  } else if ((event.ctrlKey || event.metaKey) && key === "2") {
    event.preventDefault();
    setCommand("lint");
  } else if ((event.ctrlKey || event.metaKey) && key === "3") {
    event.preventDefault();
    setCommand("explain");
  } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === "c") {
    event.preventDefault();
    copyJsonReport();
  } else if ((event.ctrlKey || event.metaKey) && key === "f") {
    event.preventDefault();
    elements.findingSearch.focus();
  } else if (event.key === "Escape") {
    closeDrawer();
    closeShortcuts();
  } else if (event.key === "?") {
    openShortcuts();
  }
}

function handleAppCommand(command) {
  const commands = {
    "open-project": selectProject,
    "save-report": saveReport,
    "copy-json": copyJsonReport,
    "toggle-theme": toggleTheme,
    "mode-verify": () => setCommand("verify"),
    "mode-lint": () => setCommand("lint"),
    "mode-explain": () => setCommand("explain"),
    "run-check": runCheck,
    shortcuts: openShortcuts,
    about: openShortcuts
  };

  commands[command]?.();
}

function handleDrop(event) {
  event.preventDefault();
  document.body.classList.remove("dragging");
  const file = event.dataTransfer?.files?.[0];
  if (file?.path) {
    setProjectPath(file.path);
  }
}

function openShortcuts() {
  elements.shortcutsOverlay.classList.remove("hidden");
}

function closeShortcuts() {
  elements.shortcutsOverlay.classList.add("hidden");
}

function persistPreferences() {
  window.agentsDoctor.savePreferences({
    theme: state.theme,
    command: state.command,
    filter: state.filter,
    projectPath: state.projectPath,
    targetPath: elements.targetPath.value,
    strict: elements.strictMode.checked,
    recentProjects: state.recentProjects,
    sidebarCollapsed: state.sidebarCollapsed
  });
}

function maybeNotify(report, started) {
  if (Date.now() - started < 3000 || document.hasFocus()) {
    return;
  }

  window.agentsDoctor.notify({
    title: `${capitalize(report.command)} completed`,
    body: `${report.summary.errorCount} errors, ${report.summary.warningCount} warnings, ${report.summary.infoCount} info`
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
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

function formatDelta(value) {
  return value > 0 ? `+${value}` : String(value);
}

function severityIcon(severity) {
  const icons = {
    error: "!",
    warning: "^",
    info: "i"
  };
  return icons[severity] ?? "-";
}
