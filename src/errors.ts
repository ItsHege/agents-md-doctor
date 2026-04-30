export type AppErrorCode =
  | "E_MISSING_REPO"
  | "E_REPO_NOT_FOUND"
  | "E_REPO_NOT_DIRECTORY"
  | "E_JSON_REQUIRED"
  | "E_PATH_OUTSIDE_ROOT"
  | "E_FILE_NOT_FOUND"
  | "E_FILE_NOT_READABLE"
  | "E_FILE_TOO_LARGE";

export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

