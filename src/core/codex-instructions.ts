import fs from "node:fs";
import path from "node:path";
import { readTextFileWithinRoot } from "../io/index.js";
import { normalizeRelativePath } from "../path-utils.js";

export const CODEX_PROJECT_FILE_NAMES = ["AGENTS.override.md", "AGENTS.md"] as const;

export function loadCodexInstructionFiles<T extends { absolutePath: string; relativePath: string }>(
  root: string,
  files: T[],
  fallbackFileNames: string[]
): Array<T & { content: string }> {
  const orderedNames = [...CODEX_PROJECT_FILE_NAMES, ...fallbackFileNames];
  const candidateNames = new Set(orderedNames);
  const byDirectory = new Map<string, Map<string, T>>();

  for (const file of files) {
    const name = path.posix.basename(file.relativePath);
    if (!candidateNames.has(name)) {
      continue;
    }
    const directory = path.posix.dirname(file.relativePath);
    const candidates = byDirectory.get(directory) ?? new Map<string, T>();
    candidates.set(name, file);
    byDirectory.set(directory, candidates);
  }

  const selectedContent = new Map<string, string>();
  for (const candidates of byDirectory.values()) {
    for (const name of orderedNames) {
      const file = candidates.get(name);
      if (!file) {
        continue;
      }
      const content = readTextFileWithinRoot({ root, filePath: file.absolutePath });
      if (content.trim().length > 0) {
        selectedContent.set(file.relativePath, content);
        break;
      }
    }
  }

  return files.flatMap((file) => {
    const name = path.posix.basename(file.relativePath);
    const content = candidateNames.has(name)
      ? selectedContent.get(file.relativePath)
      : readTextFileWithinRoot({ root, filePath: file.absolutePath });
    return content === undefined ? [] : [{ ...file, content }];
  });
}

export function findCodexInstructionInDirectory(
  root: string,
  directory: string,
  fallbackFileNames: string[]
): string | undefined {
  for (const fileName of [...CODEX_PROJECT_FILE_NAMES, ...fallbackFileNames]) {
    const absolutePath = path.join(directory, fileName);
    if (!fs.existsSync(absolutePath) || !fs.lstatSync(absolutePath).isFile()) {
      continue;
    }

    if (readTextFileWithinRoot({ root, filePath: absolutePath }).trim().length > 0) {
      return normalizeRelativePath(path.relative(root, absolutePath));
    }
  }

  return undefined;
}
