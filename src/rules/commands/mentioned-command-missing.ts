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

interface PackageScriptContext {
  packagePath: string | null;
  scripts: Set<string>;
}

const SCRIPT_NAME_PATTERN = /^[A-Za-z0-9:_-]+$/;
const MAKE_TARGET_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const OPTIONALITY_MARKERS = ["if present", "if available", "if it exists", "when available", "optional", "--if-present"];
const PACKAGE_MANAGER_OPTIONS_WITH_VALUE = new Set([
  "--filter",
  "-F",
  "--workspace",
  "-w",
  "--cwd",
  "--dir",
  "-C",
  "--prefix"
]);
const PNPM_DIRECT_SCRIPT_ALIASES = new Set(["test", "start", "build", "lint", "dev", "check"]);
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
  const contentLines = options.content.split(/\r?\n/);
  const findings: Finding[] = [];
  const seen = new Set<string>();
  const packageContext = loadNearestPackageScripts(options.root, options.fileAbsolutePath);
  const makeTargets = loadNearestMakeTargets(options.root, options.fileAbsolutePath);

  for (const reference of references) {
    const dedupeKey = `${reference.type}:${reference.scriptName}:${reference.line}`;

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);

    if (reference.type === "script") {
      if (packageContext.scripts.has(reference.scriptName)) {
        continue;
      }

      if (lineHasOptionalityMarker(contentLines, reference.line)) {
        continue;
      }

      const workspaceMatches = findWorkspaceScriptMatches(
        options.root,
        reference.scriptName,
        packageContext.packagePath
      );

      if (workspaceMatches.length > 0) {
        findings.push({
          ruleId: mentionedCommandMissingRuleDefinition.id,
          severity: "warning",
          message: `${options.fileRelativePath} references script "${reference.scriptName}" that is missing in the local package but present in workspace package(s): ${workspaceMatches.join(", ")}.`,
          file: options.fileRelativePath,
          line: reference.line,
          details: {
            reference: reference.raw,
            scriptName: reference.scriptName,
            source: "workspace",
            reason: "scope_ambiguous",
            matchedPackages: workspaceMatches
          }
        });
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

    if (lineHasOptionalityMarker(contentLines, reference.line)) {
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
    return parsePnpmScript(tokens);
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
  const commandTokens = extractPositionalCommandTokens(tokens.slice(1));
  const candidate = commandTokens[0];

  if (!candidate) {
    return null;
  }

  if (candidate === "run" || candidate === "run-script") {
    const scriptName = commandTokens[1];
    return isValidScriptName(scriptName) ? scriptName : null;
  }

  if (!isValidScriptName(candidate)) {
    return null;
  }

  return nonScriptCommands.has(candidate) ? null : candidate;
}

function parsePnpmScript(tokens: string[]): string | null {
  const commandTokens = extractPositionalCommandTokens(tokens.slice(1));
  const candidate = commandTokens[0];

  if (!candidate) {
    return null;
  }

  if (candidate === "run" || candidate === "run-script") {
    const scriptName = commandTokens[1];
    return isValidScriptName(scriptName) ? scriptName : null;
  }

  if (!isValidScriptName(candidate)) {
    return null;
  }

  if (PNPM_NON_SCRIPT_COMMANDS.has(candidate)) {
    return null;
  }

  if (candidate.includes(":")) {
    return candidate;
  }

  return PNPM_DIRECT_SCRIPT_ALIASES.has(candidate) ? candidate : null;
}

function parseYarnScript(tokens: string[]): string | null {
  const commandTokens = extractPositionalCommandTokens(tokens.slice(1));
  const candidate = commandTokens[0];

  if (!candidate) {
    return null;
  }

  if (candidate === "run") {
    const scriptName = commandTokens[1];
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
  if (typeof value !== "string") {
    return false;
  }

  if (isPlaceholderToken(value)) {
    return false;
  }

  return SCRIPT_NAME_PATTERN.test(value);
}

function extractPositionalCommandTokens(tokens: string[]): string[] {
  const positional: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (!token || token === "--") {
      break;
    }

    if (token.startsWith("-")) {
      if (token.includes("=")) {
        continue;
      }

      if (PACKAGE_MANAGER_OPTIONS_WITH_VALUE.has(token)) {
        index += 1;
      }

      continue;
    }

    positional.push(token);
  }

  return positional;
}

function isPlaceholderToken(token: string): boolean {
  if (token.length === 0 || token === "...") {
    return true;
  }

  if (/[<>{}\[\]]/.test(token)) {
    return true;
  }

  return false;
}

function lineHasOptionalityMarker(lines: string[], line: number): boolean {
  const rawLine = lines[line - 1];

  if (typeof rawLine !== "string") {
    return false;
  }

  const normalized = rawLine.toLowerCase();
  return OPTIONALITY_MARKERS.some((marker) => normalized.includes(marker));
}

function loadNearestPackageScripts(root: string, fileAbsolutePath: string): PackageScriptContext {
  const packagePath = findNearestFile(root, path.dirname(fileAbsolutePath), ["package.json"]);

  if (!packagePath) {
    return {
      packagePath: null,
      scripts: new Set()
    };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(packagePath, "utf8")) as { scripts?: Record<string, unknown> };
    return {
      packagePath,
      scripts: new Set(Object.keys(raw.scripts ?? {}))
    };
  } catch {
    return {
      packagePath,
      scripts: new Set()
    };
  }
}

function findWorkspaceScriptMatches(root: string, scriptName: string, nearestPackagePath: string | null): string[] {
  const packagePaths = findWorkspacePackageJsonFiles(root);
  const matches: string[] = [];

  for (const packagePath of packagePaths) {
    if (nearestPackagePath && path.resolve(packagePath) === path.resolve(nearestPackagePath)) {
      continue;
    }

    try {
      const raw = JSON.parse(fs.readFileSync(packagePath, "utf8")) as { scripts?: Record<string, unknown> };
      const scripts = raw.scripts ?? {};

      if (!Object.prototype.hasOwnProperty.call(scripts, scriptName)) {
        continue;
      }

      matches.push(normalizeRelativePath(path.relative(root, packagePath)));
    } catch {
      continue;
    }
  }

  return matches.sort();
}

function findWorkspacePackageJsonFiles(root: string): string[] {
  const results: string[] = [];
  const queue: string[] = [root];
  const ignoredDirectoryNames = new Set([".git", "node_modules", "dist", "build", "coverage"]);

  while (queue.length > 0) {
    const directory = queue.shift();
    if (!directory) {
      continue;
    }

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);

      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        if (ignoredDirectoryNames.has(entry.name)) {
          continue;
        }

        queue.push(entryPath);
        continue;
      }

      if (!entry.isFile() || entry.name !== "package.json") {
        continue;
      }

      results.push(entryPath);
    }
  }

  return results;
}

function loadNearestMakeTargets(root: string, fileAbsolutePath: string): Set<string> {
  const makePath = findNearestFile(root, path.dirname(fileAbsolutePath), ["Makefile", "makefile", "GNUmakefile"]);

  if (!makePath || !fs.existsSync(makePath)) {
    return new Set();
  }

  const targets = new Set<string>();
  const lines = fs.readFileSync(makePath, "utf8").split(/\r?\n/);
  const variables = collectMakeVariables(lines);

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

    const candidates =
      head === ".PHONY"
        ? expandMakeTokens(line.slice(ruleSeparatorIndex + 1).trim().split(/\s+/), variables)
        : expandMakeTokens(head.split(/\s+/), variables);

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

function collectMakeVariables(lines: string[]): Map<string, string[]> {
  const variables = new Map<string, string[]>();
  let logicalLine = "";

  for (const rawLine of lines) {
    const trimmedRight = rawLine.replace(/\s+$/u, "");
    const continued = trimmedRight.endsWith("\\");
    logicalLine += continued ? `${trimmedRight.slice(0, -1)} ` : trimmedRight;

    if (continued) {
      continue;
    }

    const line = logicalLine.split("#", 1)[0]?.trim();
    logicalLine = "";

    if (!line || line.startsWith("\t")) {
      continue;
    }

    const assignment = /^([A-Za-z_][A-Za-z0-9_]*)\s*(:=|\?=|\+=|=)\s*(.*)$/u.exec(line);
    if (!assignment) {
      continue;
    }

    const [, name, operator, value = ""] = assignment;
    const tokens = expandMakeValue(value, variables).filter((token) => MAKE_TARGET_PATTERN.test(token));

    if (operator === "+=") {
      variables.set(name, [...(variables.get(name) ?? []), ...tokens]);
      continue;
    }

    if (operator === "?=" && variables.has(name)) {
      continue;
    }

    variables.set(name, tokens);
  }

  return variables;
}

function expandMakeTokens(tokens: string[], variables: Map<string, string[]>): string[] {
  const expanded: string[] = [];

  for (const token of tokens) {
    if (!token) {
      continue;
    }

    const variableReference = /^\$\(([^)]+)\)$|^\$\{([^}]+)\}$/u.exec(token);
    const variableName = variableReference?.[1] ?? variableReference?.[2];

    if (variableName) {
      expanded.push(...(variables.get(variableName) ?? []));
      continue;
    }

    expanded.push(token);
  }

  return expanded;
}

function expandMakeValue(value: string, variables: Map<string, string[]>): string[] {
  const trimmedValue = value.trim();
  const addPrefix = /^\$\(addprefix\s+([^,]+),\s*\$\(([^)]+)\)\)$/u.exec(trimmedValue);

  if (addPrefix) {
    const [, prefix = "", variableName = ""] = addPrefix;
    return (variables.get(variableName) ?? []).map((token) => `${prefix}${token}`);
  }

  return expandMakeTokens(trimmedValue.split(/\s+/), variables);
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
