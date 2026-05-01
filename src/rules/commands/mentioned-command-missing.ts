import fs from "node:fs";
import path from "node:path";
import { extractMarkdownElements } from "../../core/markdown.js";
import { normalizeRelativePath } from "../../path-utils.js";
import type { Finding, RuleDefinition, Severity } from "../../types/index.js";

export const mentionedCommandMissingRuleDefinition: RuleDefinition = {
  id: "commands.mentioned_command_missing",
  category: "commands",
  defaultSeverity: "error",
  title: "Mentioned command missing",
  description: "Reports command references in AGENTS.md that are not declared in local scripts or targets."
};

export interface CheckMentionedCommandsOptions {
  root: string;
  fileAbsolutePath: string;
  fileRelativePath: string;
  content: string;
  severity?: Severity;
}

interface CommandReference {
  line: number;
  raw: string;
  scriptName: string;
  type: "script" | "make";
}

const SCRIPT_NAME_PATTERN = /^[A-Za-z0-9:_-]+$/;
const MAKE_TARGET_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const NPM_NON_SCRIPT_COMMANDS = new Set([
  "add",
  "audit",
  "ci",
  "config",
  "dedupe",
  "doctor",
  "exec",
  "explain",
  "help",
  "init",
  "install",
  "link",
  "login",
  "logout",
  "outdated",
  "owner",
  "pack",
  "prefix",
  "profile",
  "publish",
  "rebuild",
  "remove",
  "root",
  "search",
  "shrinkwrap",
  "star",
  "team",
  "token",
  "uninstall",
  "unpublish",
  "unstar",
  "update",
  "version",
  "view",
  "whoami"
]);
const PNPM_NON_SCRIPT_COMMANDS = new Set([
  "add",
  "audit",
  "config",
  "deploy",
  "dlx",
  "env",
  "exec",
  "fetch",
  "help",
  "import",
  "init",
  "install",
  "licenses",
  "link",
  "list",
  "outdated",
  "patch",
  "patch-commit",
  "publish",
  "prune",
  "rebuild",
  "remove",
  "root",
  "setup",
  "store",
  "unlink",
  "update",
  "why"
]);
const YARN_NON_SCRIPT_COMMANDS = new Set([
  "add",
  "bin",
  "cache",
  "config",
  "create",
  "dedupe",
  "dlx",
  "exec",
  "help",
  "import",
  "info",
  "init",
  "install",
  "link",
  "node",
  "outdated",
  "pack",
  "plugin",
  "rebuild",
  "remove",
  "set",
  "unlink",
  "up",
  "upgrade",
  "version",
  "why",
  "workspace",
  "workspaces"
]);

export function checkMentionedCommands(options: CheckMentionedCommandsOptions): Finding[] {
  const references = findCommandReferences(options.content);
  const findings: Finding[] = [];
  const seen = new Set<string>();
  const packageScripts = loadNearestPackageScripts(options.root, options.fileAbsolutePath);
  const makeTargets = loadNearestMakeTargets(options.root, options.fileAbsolutePath);

  for (const reference of references) {
    const dedupeKey = `${reference.type}:${reference.scriptName}:${reference.line}`;

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);

    if (reference.type === "script") {
      if (packageScripts.has(reference.scriptName)) {
        continue;
      }

      findings.push({
        ruleId: mentionedCommandMissingRuleDefinition.id,
        severity: options.severity ?? mentionedCommandMissingRuleDefinition.defaultSeverity,
        message: `${options.fileRelativePath} references a missing package script: ${reference.scriptName}.`,
        file: options.fileRelativePath,
        line: reference.line,
        details: {
          reference: reference.raw,
          scriptName: reference.scriptName,
          source: "package.json"
        }
      });
      continue;
    }

    if (makeTargets.has(reference.scriptName)) {
      continue;
    }

    findings.push({
      ruleId: mentionedCommandMissingRuleDefinition.id,
      severity: options.severity ?? mentionedCommandMissingRuleDefinition.defaultSeverity,
      message: `${options.fileRelativePath} references a missing Makefile target: ${reference.scriptName}.`,
      file: options.fileRelativePath,
      line: reference.line,
      details: {
        reference: reference.raw,
        targetName: reference.scriptName,
        source: "Makefile"
      }
    });
  }

  return findings;
}

function findCommandReferences(content: string): CommandReference[] {
  const elements = extractMarkdownElements(content);
  const references: CommandReference[] = [];

  for (const element of elements) {
    if (element.type === "inlineCode") {
      references.push(...parseReferencesFromLine(element.value, element.location.line));
      continue;
    }

    if (element.type !== "code") {
      continue;
    }

    const lines = element.value.split(/\r?\n/);

    for (const [index, line] of lines.entries()) {
      references.push(...parseReferencesFromLine(line, element.location.line + index + 1));
    }
  }

  return references;
}

function parseReferencesFromLine(rawLine: string, line: number): CommandReference[] {
  const cleanedLine = rawLine.trim().replace(/^\$+\s*/, "").replace(/^>\s*/, "");

  if (cleanedLine.length === 0) {
    return [];
  }

  const references: CommandReference[] = [];

  const scriptReference = parseScriptReference(cleanedLine);
  if (scriptReference) {
    references.push({
      type: "script",
      scriptName: scriptReference,
      raw: cleanedLine,
      line
    });
    return references;
  }

  const makeReference = parseMakeReference(cleanedLine);
  if (makeReference) {
    references.push({
      type: "make",
      scriptName: makeReference,
      raw: cleanedLine,
      line
    });
  }

  return references;
}

function parseScriptReference(cleanedLine: string): string | null {
  const tokens = cleanedLine.split(/\s+/);
  const [command] = tokens;

  if (!command) {
    return null;
  }

  if (command === "npm") {
    return parseNodePackageManagerScript(tokens, NPM_NON_SCRIPT_COMMANDS);
  }

  if (command === "pnpm") {
    return parseNodePackageManagerScript(tokens, PNPM_NON_SCRIPT_COMMANDS);
  }

  if (command === "bun") {
    const runCommand = tokens[1];
    if (runCommand !== "run" && runCommand !== "run-script") {
      return null;
    }

    const scriptName = tokens[2];
    return isValidScriptName(scriptName) ? scriptName : null;
  }

  if (command === "yarn") {
    return parseYarnScript(tokens);
  }

  return null;
}

function parseNodePackageManagerScript(tokens: string[], nonScriptCommands: Set<string>): string | null {
  const candidate = tokens[1];

  if (!candidate) {
    return null;
  }

  if (candidate === "run" || candidate === "run-script") {
    const scriptName = tokens[2];
    return isValidScriptName(scriptName) ? scriptName : null;
  }

  if (!isValidScriptName(candidate)) {
    return null;
  }

  return nonScriptCommands.has(candidate) ? null : candidate;
}

function parseYarnScript(tokens: string[]): string | null {
  const candidate = tokens[1];

  if (!candidate) {
    return null;
  }

  if (candidate === "run") {
    const scriptName = tokens[2];
    return isValidScriptName(scriptName) ? scriptName : null;
  }

  if (!isValidScriptName(candidate)) {
    return null;
  }

  return YARN_NON_SCRIPT_COMMANDS.has(candidate) ? null : candidate;
}

function parseMakeReference(cleanedLine: string): string | null {
  const tokens = cleanedLine.split(/\s+/);

  if (tokens[0] !== "make") {
    return null;
  }

  for (const token of tokens.slice(1)) {
    if (token.startsWith("-")) {
      continue;
    }

    if (token.includes("=")) {
      continue;
    }

    if (!MAKE_TARGET_PATTERN.test(token)) {
      continue;
    }

    return token;
  }

  return null;
}

function isValidScriptName(value: string | undefined): value is string {
  return typeof value === "string" && SCRIPT_NAME_PATTERN.test(value);
}

function loadNearestPackageScripts(root: string, fileAbsolutePath: string): Set<string> {
  const packagePath = findNearestFile(root, path.dirname(fileAbsolutePath), ["package.json"]);

  if (!packagePath) {
    return new Set();
  }

  try {
    const raw = JSON.parse(fs.readFileSync(packagePath, "utf8")) as { scripts?: Record<string, unknown> };
    return new Set(Object.keys(raw.scripts ?? {}));
  } catch {
    return new Set();
  }
}

function loadNearestMakeTargets(root: string, fileAbsolutePath: string): Set<string> {
  const makePath = findNearestFile(root, path.dirname(fileAbsolutePath), ["Makefile", "makefile", "GNUmakefile"]);

  if (!makePath || !fs.existsSync(makePath)) {
    return new Set();
  }

  const targets = new Set<string>();
  const lines = fs.readFileSync(makePath, "utf8").split(/\r?\n/);

  for (const rawLine of lines) {
    if (rawLine.startsWith("\t")) {
      continue;
    }

    const line = rawLine.split("#", 1)[0]?.trim();
    if (!line) {
      continue;
    }

    const ruleSeparatorIndex = line.indexOf(":");
    if (ruleSeparatorIndex <= 0) {
      continue;
    }

    if (line[ruleSeparatorIndex + 1] === "=") {
      continue;
    }

    const head = line.slice(0, ruleSeparatorIndex).trim();
    if (head.length === 0) {
      continue;
    }

    const candidates = head.split(/\s+/);

    for (const candidate of candidates) {
      if (!MAKE_TARGET_PATTERN.test(candidate)) {
        continue;
      }

      if (candidate.startsWith(".")) {
        continue;
      }

      targets.add(candidate);
    }
  }

  return targets;
}

function findNearestFile(root: string, startDirectory: string, fileNames: string[]): string | null {
  let directory = startDirectory;

  while (true) {
    for (const fileName of fileNames) {
      const candidatePath = path.join(directory, fileName);

      if (fs.existsSync(candidatePath)) {
        return candidatePath;
      }
    }

    const relativeDirectory = normalizeRelativePath(path.relative(root, directory));

    if (relativeDirectory === "" || relativeDirectory === ".") {
      return null;
    }

    const parentDirectory = path.dirname(directory);

    if (parentDirectory === directory) {
      return null;
    }

    directory = parentDirectory;
  }
}
