import fs from "node:fs";
import path from "node:path";
import picomatch from "picomatch";
import { parse, TomlError, type TomlTable } from "smol-toml";
import { readTextFileWithinRoot } from "../../io/index.js";
import { normalizeRelativePath } from "../../path-utils.js";
import type { Finding, RuleDefinition, Severity } from "../../types/index.js";

export const codexAgentRoleInvalidRuleDefinition: RuleDefinition = {
  id: "runtime.codex_agent_role_invalid",
  category: "runtime",
  defaultSeverity: "error",
  title: "Invalid Codex agent role file",
  description: "Reports repo-local .codex/agents/*.toml files that Codex cannot load as custom agent roles."
};

const MAX_CODEX_AGENT_ROLE_BYTES = 256 * 1024;
const REQUIRED_STRING_FIELDS = ["name", "description", "developer_instructions"] as const;

export interface CheckCodexAgentRolesOptions {
  root: string;
  ignore?: string[];
  severity?: Severity;
}

interface CodexAgentRoleFile {
  absolutePath: string;
  relativePath: string;
}

export function checkCodexAgentRoles(options: CheckCodexAgentRolesOptions): Finding[] {
  const severity = options.severity ?? codexAgentRoleInvalidRuleDefinition.defaultSeverity;
  const files = findCodexAgentRoleFiles(options.root, options.ignore ?? []);
  const findings: Finding[] = [];

  for (const file of files) {
    const content = readTextFileWithinRoot({
      root: options.root,
      filePath: file.absolutePath,
      maxBytes: MAX_CODEX_AGENT_ROLE_BYTES
    });

    findings.push(...validateCodexAgentRoleFile(file.relativePath, content, severity));
  }

  return findings;
}

function findCodexAgentRoleFiles(root: string, ignore: string[]): CodexAgentRoleFile[] {
  const agentsDirectory = path.join(root, ".codex", "agents");

  if (!fs.existsSync(agentsDirectory)) {
    return [];
  }

  const directoryStats = fs.lstatSync(agentsDirectory);
  if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
    return [];
  }

  const isIgnored = createIgnoreMatcher(ignore);
  const files: CodexAgentRoleFile[] = [];

  for (const entry of fs.readdirSync(agentsDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || entry.isSymbolicLink() || path.extname(entry.name).toLowerCase() !== ".toml") {
      continue;
    }

    const absolutePath = path.join(agentsDirectory, entry.name);
    const relativePath = normalizeRelativePath(path.relative(root, absolutePath));

    if (isIgnored(relativePath)) {
      continue;
    }

    files.push({
      absolutePath,
      relativePath
    });
  }

  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function validateCodexAgentRoleFile(file: string, content: string, severity: Severity): Finding[] {
  let parsed: TomlTable;

  try {
    parsed = parse(content);
  } catch (error) {
    const line = error instanceof TomlError ? error.line : 1;
    const column = error instanceof TomlError ? error.column : undefined;
    const message = error instanceof Error ? firstLine(error.message) : "invalid TOML";

    return [
      {
        ruleId: codexAgentRoleInvalidRuleDefinition.id,
        severity,
        message: `${file} is not valid TOML for a Codex agent role: ${message}`,
        file,
        line,
        ...(column ? { column } : {}),
        details: {
          surface: "codex-agent-role",
          scope: "repo-local",
          source: "project",
          reason: "toml_parse_error"
        }
      }
    ];
  }

  const findings: Finding[] = [];

  const legacyAgentTable = parsed.agent;
  if (isPlainObject(legacyAgentTable)) {
    findings.push({
      ruleId: codexAgentRoleInvalidRuleDefinition.id,
      severity,
      message:
        `${file} defines [agent] as a TOML table, but Codex standalone agent role files require ` +
        "top-level string fields: name, description, developer_instructions.",
      file,
      line: findTomlKeyLine(content, "agent"),
      details: {
        surface: "codex-agent-role",
        scope: "repo-local",
        source: "project",
        reason: "legacy_agent_table",
        field: "agent",
        expectedType: "string",
        actualType: "table",
        requiredFields: [...REQUIRED_STRING_FIELDS]
      }
    });

    return findings;
  }

  for (const field of REQUIRED_STRING_FIELDS) {
    const value = parsed[field];

    if (typeof value === "undefined") {
      findings.push({
        ruleId: codexAgentRoleInvalidRuleDefinition.id,
        severity,
        message: `${file} is missing required top-level Codex agent role field: ${field}.`,
        file,
        line: 1,
        details: {
          surface: "codex-agent-role",
          scope: "repo-local",
          source: "project",
          reason: "missing_required_field",
          field,
          expectedType: "string"
        }
      });

      continue;
    }

    if (typeof value !== "string") {
      findings.push({
        ruleId: codexAgentRoleInvalidRuleDefinition.id,
        severity,
        message: `${file} has invalid Codex agent role field ${field}: expected string, found ${describeTomlType(value)}.`,
        file,
        line: findTomlKeyLine(content, field),
        details: {
          surface: "codex-agent-role",
          scope: "repo-local",
          source: "project",
          reason: "invalid_field_type",
          field,
          expectedType: "string",
          actualType: describeTomlType(value)
        }
      });
    }
  }

  return findings;
}

function createIgnoreMatcher(patterns: string[]): (relativePath: string) => boolean {
  if (patterns.length === 0) {
    return () => false;
  }

  const matchers = patterns.map((pattern) => picomatch(pattern.replace(/\\/g, "/"), { dot: true }));

  return (relativePath) => {
    const normalizedPath = relativePath.replace(/\\/g, "/");
    return matchers.some((matches) => matches(normalizedPath));
  };
}

function findTomlKeyLine(content: string, key: string): number {
  const tablePattern = new RegExp(`^\\s*\\[\\s*${escapeRegExp(key)}\\s*\\]`);
  const keyPattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`);
  const lines = content.split(/\r\n|\n|\r/g);

  for (const [index, line] of lines.entries()) {
    if (tablePattern.test(line) || keyPattern.test(line)) {
      return index + 1;
    }
  }

  return 1;
}

function firstLine(value: string): string {
  return value.split(/\r\n|\n|\r/g)[0] ?? value;
}

function describeTomlType(value: unknown): string {
  if (Array.isArray(value)) {
    return "array";
  }

  if (isPlainObject(value)) {
    return "table";
  }

  return typeof value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
