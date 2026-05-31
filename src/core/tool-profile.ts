import { z } from "zod";

export const toolProfiles = [
  "auto",
  "codex",
  "claude-code",
  "cursor",
  "gemini-cli",
  "github-copilot",
  "windsurf",
  "cline"
] as const;

export const ToolProfileSchema = z.enum(toolProfiles);

export type ToolProfile = z.infer<typeof ToolProfileSchema>;

export function defaultLintFileNamesForProfile(profile: ToolProfile): string[] {
  if (profile === "claude-code") {
    return ["AGENTS.md", "CLAUDE.md"];
  }

  if (profile === "gemini-cli") {
    return ["AGENTS.md", "GEMINI.md"];
  }

  return ["AGENTS.md"];
}

export function filterToolEvidenceForProfile<T extends { toolId: string }>(
  evidence: T[],
  profile: ToolProfile
): T[] {
  if (profile === "auto") {
    return evidence;
  }

  return evidence.filter((entry) => entry.toolId === profile);
}
