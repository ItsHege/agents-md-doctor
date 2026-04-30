import fs from "node:fs";
import path from "node:path";
import { AppError } from "../errors.js";
import { isPathInsideRoot } from "../path-utils.js";

export const DEFAULT_MAX_READ_BYTES = 1_000_000;

export interface ReadTextFileOptions {
  root: string;
  filePath: string;
  maxBytes?: number;
}

export function readTextFileWithinRoot(options: ReadTextFileOptions): string {
  const root = fs.realpathSync.native(path.resolve(options.root));
  const requestedPath = path.resolve(options.filePath);

  if (!fs.existsSync(requestedPath)) {
    throw new AppError("E_FILE_NOT_FOUND", `file does not exist: ${requestedPath}`);
  }

  const realFilePath = fs.realpathSync.native(requestedPath);

  if (!isPathInsideRoot(root, realFilePath)) {
    throw new AppError("E_PATH_OUTSIDE_ROOT", `file is outside root: ${requestedPath}`);
  }

  const stats = fs.statSync(realFilePath);

  if (!stats.isFile()) {
    throw new AppError("E_FILE_NOT_READABLE", `path is not a file: ${requestedPath}`);
  }

  const maxBytes = options.maxBytes ?? DEFAULT_MAX_READ_BYTES;

  if (stats.size > maxBytes) {
    throw new AppError(
      "E_FILE_TOO_LARGE",
      `file is too large to read: ${requestedPath} (${stats.size} bytes, max ${maxBytes})`
    );
  }

  return fs.readFileSync(realFilePath, "utf8");
}

