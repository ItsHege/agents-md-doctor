import path from "node:path";
import { z } from "zod";
import { CODEX_PROJECT_FILE_NAMES } from "./codex-instructions.js";

export const CodexBudgetDetailsSchema = z.object({
  scope: z.literal("repository-local"),
  measurement: z.literal("utf8-file-content-bytes"),
  maxBytes: z.number().int().positive(),
  maxBytesSource: z.enum(["default", "doctor_config"]),
  sourceBytes: z.number().int().nonnegative(),
  overLimit: z.boolean(),
  files: z.array(z.object({ file: z.string().min(1), bytes: z.number().int().nonnegative() }))
});

export type CodexBudgetDetails = z.infer<typeof CodexBudgetDetailsSchema>;

export interface CodexBudgetFile {
  relativePath: string;
  content: string;
}

export function buildCodexBudgetDetails(
  files: CodexBudgetFile[],
  maxBytes: number,
  maxBytesSource: "default" | "doctor_config"
): CodexBudgetDetails {
  const measured = files.map((file) => ({
    file: file.relativePath,
    bytes: Buffer.byteLength(file.content, "utf8")
  }));
  const sourceBytes = measured.reduce((sum, file) => sum + file.bytes, 0);

  return CodexBudgetDetailsSchema.parse({
    scope: "repository-local",
    measurement: "utf8-file-content-bytes",
    maxBytes,
    maxBytesSource,
    sourceBytes,
    overLimit: sourceBytes > maxBytes,
    files: measured
  });
}

export function findLargestCodexBudget(
  files: CodexBudgetFile[],
  fallbackFileNames: string[],
  maxBytes: number,
  maxBytesSource: "default" | "doctor_config"
): { targetDirectory: string; budget: CodexBudgetDetails } | undefined {
  const names = new Set([...CODEX_PROJECT_FILE_NAMES, ...fallbackFileNames]);
  const byDirectory = new Map<string, CodexBudgetFile>();
  for (const file of files) {
    if (names.has(path.posix.basename(file.relativePath))) {
      byDirectory.set(path.posix.dirname(file.relativePath), file);
    }
  }

  const totals = new Map<string, number>();
  const totalFor = (directory: string): number => {
    const cached = totals.get(directory);
    if (cached !== undefined) {
      return cached;
    }
    const file = byDirectory.get(directory);
    const localBytes = file ? Buffer.byteLength(file.content, "utf8") : 0;
    const total = localBytes + (directory === "." ? 0 : totalFor(path.posix.dirname(directory)));
    totals.set(directory, total);
    return total;
  };

  let largestDirectory: string | undefined;
  let largestBytes = -1;
  for (const directory of [...byDirectory.keys()].sort()) {
    const total = totalFor(directory);
    if (total > largestBytes) {
      largestDirectory = directory;
      largestBytes = total;
    }
  }

  if (!largestDirectory) {
    return undefined;
  }

  const chain: CodexBudgetFile[] = [];
  let current = largestDirectory;
  while (true) {
    const file = byDirectory.get(current);
    if (file) {
      chain.push(file);
    }
    if (current === ".") {
      break;
    }
    current = path.posix.dirname(current);
  }
  chain.reverse();

  return {
    targetDirectory: largestDirectory,
    budget: buildCodexBudgetDetails(chain, maxBytes, maxBytesSource)
  };
}
