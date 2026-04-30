import path from "node:path";

export function normalizeRelativePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

export function isPathInsideRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

