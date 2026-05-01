import fs from "node:fs";
import path from "node:path";
import picomatch from "picomatch";
import { normalizeRelativePath } from "../path-utils.js";

export interface AgentsFileReference {
  absolutePath: string;
  relativePath: string;
}

const ignoredDirectoryNames = new Set([".git", "node_modules", "dist", "build", "coverage"]);

export interface FindAgentsFilesOptions {
  ignore?: string[];
}

export function findAgentsFiles(root: string, options: FindAgentsFilesOptions = {}): AgentsFileReference[] {
  const resolvedRoot = path.resolve(root);
  const files: AgentsFileReference[] = [];
  const isIgnored = createIgnoreMatcher(options.ignore ?? []);

  walkDirectory(resolvedRoot, resolvedRoot, files, isIgnored);

  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function walkDirectory(
  root: string,
  directory: string,
  files: AgentsFileReference[],
  isIgnored: (relativePath: string) => boolean
): void {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
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
        walkDirectory(root, absolutePath, files, isIgnored);
      }

      continue;
    }

    if (entry.isFile() && entry.name === "AGENTS.md") {
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
