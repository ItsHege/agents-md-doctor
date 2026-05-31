import fs from "node:fs";
import path from "node:path";
import {
  CONFIG_FILE_NAME,
  DEFAULT_INSTRUCTION_GRAPH_INCLUDE
} from "../config/load-config.js";
import { AppError, isAppError } from "../errors.js";
import type { CommandResult } from "./lint.js";

export interface InitCommandOptions {
  root?: string;
  force?: boolean;
}

interface StarterConfig {
  ignore: string[];
  toolProfile: "auto";
  lintFileNames: string[];
  maxLines: number;
  failOnWarning: boolean;
  instructionGraph: {
    enabled: boolean;
    maxDepth: number;
    include: string[];
  };
  rules: {
    "size.file_too_long": {
      severity: "warning";
      maxLines: number;
    };
    "structure.required_sections": {
      severity: "warning";
      requiredHeadings: string[];
    };
  };
}

const STARTER_CONFIG: StarterConfig = {
  ignore: [],
  toolProfile: "auto",
  lintFileNames: ["AGENTS.md"],
  maxLines: 500,
  failOnWarning: false,
  instructionGraph: {
    enabled: false,
    maxDepth: 2,
    include: DEFAULT_INSTRUCTION_GRAPH_INCLUDE
  },
  rules: {
    "size.file_too_long": {
      severity: "warning",
      maxLines: 500
    },
    "structure.required_sections": {
      severity: "warning",
      requiredHeadings: ["Safety", "Testing"]
    }
  }
};

export function runInitCommand(options: InitCommandOptions): CommandResult {
  try {
    const root = resolveRoot(options.root ?? process.cwd());
    const configPath = path.join(root, CONFIG_FILE_NAME);

    if (fs.existsSync(configPath) && options.force !== true) {
      return {
        exitCode: 0,
        stdout: [
          "agents-doctor init: config already exists",
          `path: ${CONFIG_FILE_NAME}`,
          "No changes made. Use --force to overwrite."
        ].join("\n") + "\n",
        stderr: ""
      };
    }

    fs.writeFileSync(configPath, `${JSON.stringify(STARTER_CONFIG, null, 2)}\n`, "utf8");

    return {
      exitCode: 0,
      stdout: [
        "agents-doctor init: created starter config",
        `path: ${CONFIG_FILE_NAME}`,
        "Next: run agents-doctor verify --json ."
      ].join("\n") + "\n",
      stderr: ""
    };
  } catch (error) {
    return {
      exitCode: 2,
      stdout: "",
      stderr: `agents-doctor: error: ${formatErrorMessage(error)}\n`
    };
  }
}

function resolveRoot(root: string): string {
  const resolvedRoot = path.resolve(root);

  if (!fs.existsSync(resolvedRoot)) {
    throw new AppError("E_REPO_NOT_FOUND", `repo path does not exist: ${resolvedRoot}`);
  }

  const realRoot = fs.realpathSync.native(resolvedRoot);
  const stats = fs.statSync(realRoot);

  if (!stats.isDirectory()) {
    throw new AppError("E_REPO_NOT_DIRECTORY", `repo path is not a directory: ${resolvedRoot}`);
  }

  return realRoot;
}

function formatErrorMessage(error: unknown): string {
  if (isAppError(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "unknown runtime failure";
}
