import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { defaultLintFileNamesForProfile, ToolProfileSchema, type ToolProfile } from "../core/tool-profile.js";
import { AppError } from "../errors.js";
import { RuleIdSchema, SeveritySchema } from "../types/index.js";

export const CONFIG_FILE_NAME = ".agents-doctor.json";
export const MAX_CONFIG_BYTES = 256 * 1024;

const RuleSeverityOverrideSchema = z.union([SeveritySchema, z.literal("off")]);
const ReviewedFindingStatusSchema = z.enum(["intentional", "false_positive", "accepted_risk"]);

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

export const DEFAULT_CONTEXT_HYGIENE_INCLUDE = ["**/*.md", "**/*.mdx"];
export const DEFAULT_CONTEXT_HYGIENE_PUBLIC_PATHS = [".", "docs", "examples"];
export const DEFAULT_CONTEXT_HYGIENE_PUBLIC_INSTRUCTION_PATHS = [
  "**/AGENTS.md",
  "**/CLAUDE.md",
  "**/GEMINI.md",
  ".github/copilot-instructions.md",
  ".github/instructions/**/*.md",
  ".cursor/rules/**/*.md",
  ".windsurf/rules/**/*.md",
  ".clinerules/**/*.md"
];
export const DEFAULT_CONTEXT_STALE_AFTER_DAYS = 60;
export const DEFAULT_CONTEXT_OVERLAP_TOKEN_MIN_LENGTH = 4;
export const DEFAULT_CONTEXT_MAX_FILE_SIZE_KB = 1000;
export const DEFAULT_CONTEXT_MAX_FILES_SCANNED = 500;
export const DEFAULT_CONTEXT_MAX_DEPTH = 40;
export const DEFAULT_PROMPT_INJECTION_INCLUDE = [
  "**/AGENTS.md",
  "**/CLAUDE.md",
  "**/GEMINI.md",
  ".github/copilot-instructions.md",
  ".github/instructions/**/*.md",
  ".cursor/rules/**/*.md",
  ".cursor/rules/**/*.mdc",
  ".windsurf/rules/**/*.md",
  ".clinerules/**/*.md"
];
export const DEFAULT_PROMPT_INJECTION_MAX_FILE_SIZE_KB = 1000;
export const DEFAULT_PROMPT_INJECTION_MAX_FILES_SCANNED = 500;
export const DEFAULT_PROMPT_INJECTION_MAX_DEPTH = 40;

const InstructionGraphConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    maxDepth: z.number().int().min(0).max(10).optional(),
    include: z.array(z.string().min(1)).optional()
  })
  .strict();

const ContextHygieneConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    staleAfterDays: z.number().int().positive().optional(),
    include: z.array(z.string().min(1)).optional(),
    ignore: z.array(z.string().min(1)).optional(),
    publicPaths: z.array(z.string().min(1)).optional(),
    publicScopeInstructionPaths: z.array(z.string().min(1)).optional(),
    overlapDetection: z.literal("exact").optional(),
    overlapTokenMinLength: z.number().int().positive().optional(),
    maxFileSizeKb: z.number().int().positive().optional(),
    maxFilesScanned: z.number().int().positive().optional(),
    maxDepth: z.number().int().min(0).max(100).optional()
  })
  .strict();

const PromptInjectionConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    include: z.array(z.string().min(1)).optional(),
    ignore: z.array(z.string().min(1)).optional(),
    scanCodeBlocks: z.boolean().optional(),
    maxFileSizeKb: z.number().int().positive().optional(),
    maxFilesScanned: z.number().int().positive().optional(),
    maxDepth: z.number().int().min(0).max(100).optional()
  })
  .strict();

const ReviewedFindingSchema = z
  .object({
    fingerprint: z.string().min(1).max(128),
    status: ReviewedFindingStatusSchema,
    note: z.string().min(1).max(500).optional(),
    ruleId: RuleIdSchema.optional(),
    file: z.string().min(1).max(1000).optional(),
    message: z.string().min(1).max(2000).optional(),
    createdAt: z.string().datetime({ offset: true }).optional()
  })
  .strict();

const AgentsDoctorConfigSchema = z
  .object({
    ignore: z.array(z.string().min(1)).optional(),
    toolProfile: ToolProfileSchema.optional(),
    lintFileNames: z.array(z.string().min(1)).optional(),
    maxLines: z.number().int().positive().optional(),
    failOnWarning: z.boolean().optional(),
    annotationMinSeverity: SeveritySchema.optional(),
    instructionGraph: InstructionGraphConfigSchema.optional(),
    contextHygiene: ContextHygieneConfigSchema.optional(),
    promptInjection: PromptInjectionConfigSchema.optional(),
    reviewedFindings: z.array(ReviewedFindingSchema).optional(),
    rules: z.record(RuleIdSchema, RuleConfigSchema).optional()
  })
  .strict();

export interface ResolvedInstructionGraphConfig {
  enabled: boolean;
  maxDepth: number;
  include: string[];
}

export interface ResolvedContextHygieneConfig {
  enabled: boolean;
  staleAfterDays: number;
  include: string[];
  ignore: string[];
  publicPaths: string[];
  publicScopeInstructionPaths: string[];
  overlapDetection: "exact";
  overlapTokenMinLength: number;
  maxFileSizeKb: number;
  maxFilesScanned: number;
  maxDepth: number;
}

export interface ResolvedPromptInjectionConfig {
  enabled: boolean;
  include: string[];
  ignore: string[];
  scanCodeBlocks: boolean;
  maxFileSizeKb: number;
  maxFilesScanned: number;
  maxDepth: number;
}

export type RuleSeverityOverride = z.infer<typeof RuleSeverityOverrideSchema>;
export type RuleConfig = z.infer<typeof RuleConfigSchema>;
export type ReviewedFindingConfig = z.infer<typeof ReviewedFindingSchema>;
export type AgentsDoctorConfig = z.infer<typeof AgentsDoctorConfigSchema>;

export interface ResolvedLintConfig {
  ignore: string[];
  toolProfile: ToolProfile;
  lintFileNames: string[];
  lintFileNamesConfigured: boolean;
  maxLines?: number;
  failOnWarning: boolean;
  annotationMinSeverity?: z.infer<typeof SeveritySchema>;
  instructionGraph: ResolvedInstructionGraphConfig;
  contextHygiene: ResolvedContextHygieneConfig;
  promptInjection: ResolvedPromptInjectionConfig;
  reviewedFindings: ReviewedFindingConfig[];
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
      contextHygiene: {
        enabled: false,
        staleAfterDays: DEFAULT_CONTEXT_STALE_AFTER_DAYS,
        include: DEFAULT_CONTEXT_HYGIENE_INCLUDE,
        ignore: [],
        publicPaths: DEFAULT_CONTEXT_HYGIENE_PUBLIC_PATHS,
        publicScopeInstructionPaths: DEFAULT_CONTEXT_HYGIENE_PUBLIC_INSTRUCTION_PATHS,
        overlapDetection: "exact",
        overlapTokenMinLength: DEFAULT_CONTEXT_OVERLAP_TOKEN_MIN_LENGTH,
        maxFileSizeKb: DEFAULT_CONTEXT_MAX_FILE_SIZE_KB,
        maxFilesScanned: DEFAULT_CONTEXT_MAX_FILES_SCANNED,
        maxDepth: DEFAULT_CONTEXT_MAX_DEPTH
      },
      promptInjection: {
        enabled: false,
        include: DEFAULT_PROMPT_INJECTION_INCLUDE,
        ignore: [],
        scanCodeBlocks: false,
        maxFileSizeKb: DEFAULT_PROMPT_INJECTION_MAX_FILE_SIZE_KB,
        maxFilesScanned: DEFAULT_PROMPT_INJECTION_MAX_FILES_SCANNED,
        maxDepth: DEFAULT_PROMPT_INJECTION_MAX_DEPTH
      },
      reviewedFindings: [],
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
  const contextHygieneInclude = config.contextHygiene?.include ?? DEFAULT_CONTEXT_HYGIENE_INCLUDE;
  const contextHygieneIgnore = config.contextHygiene?.ignore ?? [];
  const contextHygienePublicPaths = config.contextHygiene?.publicPaths ?? DEFAULT_CONTEXT_HYGIENE_PUBLIC_PATHS;
  const contextHygienePublicInstructionPaths =
    config.contextHygiene?.publicScopeInstructionPaths ?? DEFAULT_CONTEXT_HYGIENE_PUBLIC_INSTRUCTION_PATHS;
  const promptInjectionInclude = config.promptInjection?.include ?? DEFAULT_PROMPT_INJECTION_INCLUDE;
  const promptInjectionIgnore = config.promptInjection?.ignore ?? [];
  validateIgnorePatterns(ignore);
  validateLintFileNames(lintFileNames);
  validateIgnorePatterns(instructionGraphInclude);
  validateIgnorePatterns(contextHygieneInclude);
  validateIgnorePatterns(contextHygieneIgnore);
  validatePublicPaths(contextHygienePublicPaths);
  validateIgnorePatterns(contextHygienePublicInstructionPaths);
  validateIgnorePatterns(promptInjectionInclude);
  validateIgnorePatterns(promptInjectionIgnore);

  return {
    ignore,
    toolProfile,
    lintFileNames,
    lintFileNamesConfigured,
    ...(config.maxLines ? { maxLines: config.maxLines } : {}),
    failOnWarning: config.failOnWarning ?? false,
    ...(config.annotationMinSeverity ? { annotationMinSeverity: config.annotationMinSeverity } : {}),
    instructionGraph: {
      enabled: config.instructionGraph?.enabled ?? false,
      maxDepth: config.instructionGraph?.maxDepth ?? 2,
      include: instructionGraphInclude
    },
    contextHygiene: {
      enabled: config.contextHygiene?.enabled ?? false,
      staleAfterDays: config.contextHygiene?.staleAfterDays ?? DEFAULT_CONTEXT_STALE_AFTER_DAYS,
      include: contextHygieneInclude,
      ignore: contextHygieneIgnore,
      publicPaths: contextHygienePublicPaths,
      publicScopeInstructionPaths: contextHygienePublicInstructionPaths,
      overlapDetection: config.contextHygiene?.overlapDetection ?? "exact",
      overlapTokenMinLength: config.contextHygiene?.overlapTokenMinLength ?? DEFAULT_CONTEXT_OVERLAP_TOKEN_MIN_LENGTH,
      maxFileSizeKb: config.contextHygiene?.maxFileSizeKb ?? DEFAULT_CONTEXT_MAX_FILE_SIZE_KB,
      maxFilesScanned: config.contextHygiene?.maxFilesScanned ?? DEFAULT_CONTEXT_MAX_FILES_SCANNED,
      maxDepth: config.contextHygiene?.maxDepth ?? DEFAULT_CONTEXT_MAX_DEPTH
    },
    promptInjection: {
      enabled: config.promptInjection?.enabled ?? false,
      include: promptInjectionInclude,
      ignore: promptInjectionIgnore,
      scanCodeBlocks: config.promptInjection?.scanCodeBlocks ?? false,
      maxFileSizeKb: config.promptInjection?.maxFileSizeKb ?? DEFAULT_PROMPT_INJECTION_MAX_FILE_SIZE_KB,
      maxFilesScanned: config.promptInjection?.maxFilesScanned ?? DEFAULT_PROMPT_INJECTION_MAX_FILES_SCANNED,
      maxDepth: config.promptInjection?.maxDepth ?? DEFAULT_PROMPT_INJECTION_MAX_DEPTH
    },
    reviewedFindings: config.reviewedFindings ?? [],
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

function validatePublicPaths(publicPaths: string[]): void {
  for (const publicPath of publicPaths) {
    const normalizedPath = publicPath.replace(/\\/g, "/");

    if (normalizedPath === ".") {
      continue;
    }

    if (path.posix.isAbsolute(normalizedPath)) {
      throw new AppError("E_CONFIG_INVALID", `contextHygiene.publicPaths entries must be repo-relative: ${publicPath}`);
    }

    if (
      normalizedPath === ".." ||
      normalizedPath.startsWith("../") ||
      normalizedPath.includes("/../") ||
      normalizedPath.endsWith("/..")
    ) {
      throw new AppError(
        "E_CONFIG_INVALID",
        `contextHygiene.publicPaths entries cannot traverse outside the repo: ${publicPath}`
      );
    }
  }
}
