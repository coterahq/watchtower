/**
 * Internal assertion helpers. Kept local so the library carries no utility
 * dependency of its own.
 */

/** V8 exposes this; other engines do not, hence the optional lookup. */
const captureStackTrace = (
  Error as ErrorConstructor & {
    captureStackTrace?: (error: Error, constructorOpt?: unknown) => void;
  }
).captureStackTrace;

export function assert(cond: boolean, msg?: string): asserts cond {
  if (!cond) {
    const error = new Error(msg ?? 'Assertion Error');
    captureStackTrace?.(error, assert);
    throw error;
  }
}

/** Exhaustiveness check for switch statements over a union. */
export function unreachable(value: never, msg?: string): never {
  throw new Error(msg ?? `Unreachable case: ${JSON.stringify(value)}`);
}
