import path from "node:path";
import { parentPort, workerData } from "node:worker_threads";
import { pathToFileURL } from "node:url";

const toolProfiles = new Set(["auto", "codex", "claude-code", "cursor", "gemini-cli", "github-copilot", "windsurf", "cline"]);

try {
  const doctorDistRoot = typeof workerData?.doctorDistRoot === "string" ? workerData.doctorDistRoot : "";
  const { runDoctorReport } = await import(pathToFileURL(path.join(doctorDistRoot, "api.js")).href);
  const { applyToolProfileOverride, loadConfig } = await import(
    pathToFileURL(path.join(doctorDistRoot, "config", "index.js")).href
  );
  const { findAgentsFiles } = await import(pathToFileURL(path.join(doctorDistRoot, "discovery", "index.js")).href);

  const result = runFromPayload(workerData?.payload, {
    runDoctorReport,
    applyToolProfileOverride,
    loadConfig,
    findAgentsFiles
  });
  parentPort?.postMessage({ ok: true, result });
} catch (error) {
  parentPort?.postMessage({
    ok: false,
    error: error instanceof Error ? error.message : "Doctor worker failed."
  });
}

function runFromPayload(payload, doctorApi) {
  if (!isPlainObject(payload)) {
    return {
      ok: false,
      exitCode: 2,
      error: "Invalid run request."
    };
  }

  const command = payload.command;
  const root = typeof payload.root === "string" ? payload.root : undefined;
  const targetPath = typeof payload.targetPath === "string" ? payload.targetPath : undefined;
  const profile = typeof payload.profile === "string" && toolProfiles.has(payload.profile) ? payload.profile : "auto";
  const strict = payload.strict === true;
  const maxLines = Number.isInteger(payload.maxLines) && payload.maxLines > 0 ? payload.maxLines : undefined;
  const contextHygiene = command === "verify" && payload.contextHygiene === true;
  const contextStaleDays =
    command === "verify" && Number.isInteger(payload.contextStaleDays) && payload.contextStaleDays > 0
      ? payload.contextStaleDays
      : undefined;
  const promptInjection = command === "verify" && payload.promptInjection === true;
  const promptInjectionScanCodeBlocks = command === "verify" && payload.promptInjectionScanCodeBlocks === true;
  const ignore = Array.isArray(payload.ignore) ? payload.ignore.filter((entry) => typeof entry === "string") : undefined;

  if (command !== "lint" && command !== "verify" && command !== "explain") {
    return {
      ok: false,
      exitCode: 2,
      error: "Choose lint, verify, or explain."
    };
  }

  if (!root) {
    return {
      ok: false,
      exitCode: 2,
      error: "Select a project folder first."
    };
  }

  if (command === "explain") {
    return withUiMetadata(
      doctorApi.runDoctorReport({
        command,
        root,
        targetPath: targetPath && targetPath.trim().length > 0 ? targetPath : ".",
        profile
      }),
      profile,
      doctorApi
    );
  }

  return withUiMetadata(
    doctorApi.runDoctorReport({
      command,
      root,
      strict,
      profile,
      ...(maxLines ? { maxLines } : {}),
      ...(contextHygiene ? { contextHygiene: true } : {}),
      ...(contextStaleDays ? { contextStaleDays } : {}),
      ...(promptInjection ? { promptInjection: true } : {}),
      ...(promptInjectionScanCodeBlocks ? { promptInjectionScanCodeBlocks: true } : {}),
      ...(ignore && ignore.length > 0 ? { ignore } : {})
    }),
    profile,
    doctorApi
  );
}

function withUiMetadata(result, profile, doctorApi) {
  if (!result.ok) {
    return result;
  }

  return {
    ...result,
    meta: buildUiMetadata(result.report, profile, doctorApi)
  };
}

function buildUiMetadata(report, profile, doctorApi) {
  const root = report.root;

  if (!root || report.command === "explain") {
    return {
      scannedFiles: []
    };
  }

  try {
    const config = doctorApi.applyToolProfileOverride(doctorApi.loadConfig({ root }), profile);
    return {
      scannedFiles: doctorApi.findAgentsFiles(root, {
        ignore: config.ignore,
        fileNames: config.lintFileNames
      }).map((file) => file.relativePath)
    };
  } catch {
    return {
      scannedFiles: []
    };
  }
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
