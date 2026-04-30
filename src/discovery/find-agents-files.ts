import fs from "node:fs";
import path from "node:path";
import { normalizeRelativePath } from "../path-utils.js";

export interface AgentsFileReference {
  absolutePath: string;
  relativePath: string;
}

const ignoredDirectoryNames = new Set([".git", "node_modules", "dist", "build", "coverage"]);

export function findAgentsFiles(root: string): AgentsFileReference[] {
  const resolvedRoot = path.resolve(root);
  const files: AgentsFileReference[] = [];

  walkDirectory(resolvedRoot, resolvedRoot, files);

  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function walkDirectory(root: string, directory: string, files: AgentsFileReference[]): void {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isSymbolicLink()) {
      continue;
    }

    if (entry.isDirectory()) {
      if (!ignoredDirectoryNames.has(entry.name)) {
        walkDirectory(root, absolutePath, files);
      }

      continue;
    }

    if (entry.isFile() && entry.name === "AGENTS.md") {
      files.push({
        absolutePath,
        relativePath: normalizeRelativePath(path.relative(root, absolutePath))
      });
    }
  }
}

