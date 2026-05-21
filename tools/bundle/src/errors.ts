export class ToolsBundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolsBundleError";
  }
}

export function toolError(message: string): ToolsBundleError {
  return new ToolsBundleError(message);
}

export function fail(message: string): never {
  throw toolError(message);
}

export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
