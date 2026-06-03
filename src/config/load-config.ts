import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { defaultLintFileNamesForProfile, ToolProfileSchema, type ToolProfile } from "../core/tool-profile.js";
import { AppError } from "../errors.js";
import { RuleIdSchema, SeveritySchema } from "../types/index.js";

export const CONFIG_FILE_NAME = ".agents-doctor.json";
export const MAX_CONFIG_BYTES = 256 * 1024;

const RuleSeverityOverrideSchema = z.union([SeveritySchema, z.literal("off")]);

const RuleConfigSchema = z
  .object({
    severity: RuleSeverityOverrideSchema.optional(),
    maxLines: z.number().int().positive().optional(),
    requiredHeadings: z.array(z.string().min(1)).optional()
  })
  .strict();

export const DEFAULT_INSTRUCTION_GRAPH_INCLUDE = [
  "**/AGENTS.md",
  "**/.agents/**/*.md",
  "**/docs/agents/**/*.md",
  "**/docs/agent/**/*.md",
  "**/CLAUDE.md",
  "**/GEMINI.md",
  "**/.claude/**/*.md",
  "**/.github/copilot-instructions.md",
  "**/.cursor/rules/**/*.md",
  "**/.cursor/rules/**/*.mdc"
];

const InstructionGraphConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    maxDepth: z.number().int().min(0).max(10).optional(),
    include: z.array(z.string().min(1)).optional()
  })
  .strict();

const AgentsDoctorConfigSchema = z
  .object({
    ignore: z.array(z.string().min(1)).optional(),
    toolProfile: ToolProfileSchema.optional(),
    lintFileNames: z.array(z.string().min(1)).optional(),
    maxLines: z.number().int().positive().optional(),
    failOnWarning: z.boolean().optional(),
    instructionGraph: InstructionGraphConfigSchema.optional(),
    rules: z.record(RuleIdSchema, RuleConfigSchema).optional()
  })
  .strict();

export interface ResolvedInstructionGraphConfig {
  enabled: boolean;
  maxDepth: number;
  include: string[];
}

export type RuleSeverityOverride = z.infer<typeof RuleSeverityOverrideSchema>;
export type RuleConfig = z.infer<typeof RuleConfigSchema>;
export type AgentsDoctorConfig = z.infer<typeof AgentsDoctorConfigSchema>;

export interface ResolvedLintConfig {
  ignore: string[];
  toolProfile: ToolProfile;
  lintFileNames: string[];
  lintFileNamesConfigured: boolean;
  maxLines?: number;
  failOnWarning: boolean;
  instructionGraph: ResolvedInstructionGraphConfig;
  rules: Record<string, RuleConfig>;
}

export interface LoadConfigOptions {
  root: string;
}

export function loadConfig(options: LoadConfigOptions): ResolvedLintConfig {
  const configPath = path.join(options.root, CONFIG_FILE_NAME);

  if (!fs.existsSync(configPath)) {
    return {
      ignore: [],
      toolProfile: "auto",
      lintFileNames: defaultLintFileNamesForProfile("auto"),
      lintFileNamesConfigured: false,
      failOnWarning: false,
      instructionGraph: {
        enabled: false,
        maxDepth: 2,
        include: DEFAULT_INSTRUCTION_GRAPH_INCLUDE
      },
      rules: {}
    };
  }

  let parsedJson: unknown;

  try {
    const stats = fs.statSync(configPath);
    if (stats.size > MAX_CONFIG_BYTES) {
      throw new AppError(
        "E_FILE_TOO_LARGE",
        `${CONFIG_FILE_NAME} is too large: ${stats.size} bytes, max ${MAX_CONFIG_BYTES}`
      );
    }

    parsedJson = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "invalid JSON";
    throw new AppError("E_CONFIG_INVALID", `${CONFIG_FILE_NAME} is not valid JSON: ${message}`);
  }

  const parsedConfig = AgentsDoctorConfigSchema.safeParse(parsedJson);

  if (!parsedConfig.success) {
    throw new AppError("E_CONFIG_INVALID", `${CONFIG_FILE_NAME} is invalid: ${parsedConfig.error.issues[0]?.message}`);
  }

  const config = parsedConfig.data;
  const ignore = config.ignore ?? [];
  const toolProfile = config.toolProfile ?? "auto";
  const lintFileNamesConfigured = Array.isArray(config.lintFileNames);
  const lintFileNames = config.lintFileNames ?? defaultLintFileNamesForProfile(toolProfile);
  const instructionGraphInclude = config.instructionGraph?.include ?? DEFAULT_INSTRUCTION_GRAPH_INCLUDE;
  validateIgnorePatterns(ignore);
  validateLintFileNames(lintFileNames);
  validateIgnorePatterns(instructionGraphInclude);

  return {
    ignore,
    toolProfile,
    lintFileNames,
    lintFileNamesConfigured,
    ...(config.maxLines ? { maxLines: config.maxLines } : {}),
    failOnWarning: config.failOnWarning ?? false,
    instructionGraph: {
      enabled: config.instructionGraph?.enabled ?? false,
      maxDepth: config.instructionGraph?.maxDepth ?? 2,
      include: instructionGraphInclude
    },
    rules: config.rules ?? {}
  };
}

export function applyToolProfileOverride(config: ResolvedLintConfig, profile?: ToolProfile): ResolvedLintConfig {
  if (!profile || profile === config.toolProfile) {
    return config;
  }

  return {
    ...config,
    toolProfile: profile,
    lintFileNames: config.lintFileNamesConfigured
      ? config.lintFileNames
      : defaultLintFileNamesForProfile(profile)
  };
}

function validateLintFileNames(fileNames: string[]): void {
  for (const fileName of fileNames) {
    if (fileName.includes("/") || fileName.includes("\\") || fileName === "." || fileName === "..") {
      throw new AppError("E_CONFIG_INVALID", `lintFileNames entries must be file names, not paths: ${fileName}`);
    }
  }
}

export function validateIgnorePatterns(patterns: string[]): void {
  for (const pattern of patterns) {
    const normalizedPattern = pattern.replace(/\\/g, "/");

    if (path.posix.isAbsolute(normalizedPattern)) {
      throw new AppError("E_IGNORE_PATTERN_INVALID", `ignore pattern must be repo-relative: ${pattern}`);
    }

    if (
      normalizedPattern === ".." ||
      normalizedPattern.startsWith("../") ||
      normalizedPattern.includes("/../") ||
      normalizedPattern.endsWith("/..")
    ) {
      throw new AppError("E_IGNORE_PATTERN_INVALID", `ignore pattern cannot traverse outside the repo: ${pattern}`);
    }
  }
}
