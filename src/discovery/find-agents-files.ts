import fs from "node:fs";
import path from "node:path";
import picomatch from "picomatch";
import { AppError } from "../errors.js";
import { normalizeRelativePath } from "../path-utils.js";

export interface AgentsFileReference {
  absolutePath: string;
  relativePath: string;
}

const ignoredDirectoryNames = new Set([".git", "node_modules", "dist", "build", "coverage"]);
const DEFAULT_MAX_DIRECTORY_ENTRIES = 500_000;
const DEFAULT_MAX_DEPTH = 40;

export interface FindAgentsFilesOptions {
  ignore?: string[];
  fileNames?: string[];
  maxDirectoryEntries?: number;
  maxDepth?: number;
}

export function findAgentsFiles(root: string, options: FindAgentsFilesOptions = {}): AgentsFileReference[] {
  const resolvedRoot = path.resolve(root);
  const files: AgentsFileReference[] = [];
  const isIgnored = createIgnoreMatcher(options.ignore ?? []);
  const fileNames = new Set(options.fileNames ?? ["AGENTS.md"]);
  const budget = {
    visitedEntries: 0,
    maxDirectoryEntries: options.maxDirectoryEntries ?? DEFAULT_MAX_DIRECTORY_ENTRIES,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH
  };

  walkDirectory(resolvedRoot, resolvedRoot, files, isIgnored, fileNames, budget, 0);

  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function walkDirectory(
  root: string,
  directory: string,
  files: AgentsFileReference[],
  isIgnored: (relativePath: string) => boolean,
  fileNames: Set<string>,
  budget: { visitedEntries: number; maxDirectoryEntries: number; maxDepth: number },
  depth: number
): void {
  if (depth > budget.maxDepth) {
    throw new AppError("E_SCAN_BUDGET_EXCEEDED", `instruction file discovery exceeded max depth ${budget.maxDepth}`);
  }

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    budget.visitedEntries += 1;
    if (budget.visitedEntries > budget.maxDirectoryEntries) {
      throw new AppError(
        "E_SCAN_BUDGET_EXCEEDED",
        `instruction file discovery exceeded max directory entries ${budget.maxDirectoryEntries}`
      );
    }

    const absolutePath = path.join(directory, entry.name);
    const relativePath = normalizeRelativePath(path.relative(root, absolutePath));

    if (entry.isSymbolicLink()) {
      continue;
    }

    if (isIgnored(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      if (!ignoredDirectoryNames.has(entry.name)) {
        walkDirectory(root, absolutePath, files, isIgnored, fileNames, budget, depth + 1);
      }

      continue;
    }

    if (entry.isFile() && fileNames.has(entry.name)) {
      files.push({
        absolutePath,
        relativePath
      });
    }
  }
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
