export type OutputFormat = "human" | "json" | "github" | "sarif";

export function resolveOutputFormat(options: { format?: OutputFormat; json?: boolean }): OutputFormat {
  if (options.json === true) {
    return "json";
  }

  return options.format ?? "human";
}
