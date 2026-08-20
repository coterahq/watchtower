import React, {
  createContext,
  useContext,
  type ReactNode,
  useMemo,
} from 'react';

export interface UserContext {
  id: string;
  email?: string;
  username?: string;
}

export interface ErrorMetadata {
  /** Name of the action that failed, when the error came from one. */
  action?: string;
  /** Payload the action ran with. */
  payload?: unknown;
  /** The typed errors an action returned, if any. */
  errors?: unknown[];
}

export interface Logger {
  error(message: string, error?: unknown, metadata?: ErrorMetadata): void;
  debug(message: string, ...args: unknown[]): void;
  setUser(user: UserContext | null): void;
  clearUser(): void;
}

/**
 * Where a {@link ConsoleLogger} forwards errors in addition to the console.
 *
 * This is the seam for an error tracker — Sentry, Bugsnag, whatever the host
 * application already uses — so the library itself carries no reporting
 * dependency:
 *
 * ```ts
 * const logger = new ConsoleLogger({
 *   captureException: (error, ctx) =>
 *     Sentry.captureException(error, { extra: ctx.extra, tags: ctx.tags }),
 *   setUser: (user) => Sentry.setUser(user),
 * });
 * ```
 */
export interface ErrorReporter {
  captureException(
    error: unknown,
    context: { extra: Record<string, unknown>; tags?: Record<string, string> }
  ): void;
  setUser?(user: UserContext | null): void;
}

/**
 * Default logger: writes to the console, and hands errors to an
 * {@link ErrorReporter} when one is supplied.
 */
export class ConsoleLogger implements Logger {
  private reporter: ErrorReporter | undefined;

  constructor(reporter?: ErrorReporter) {
    this.reporter = reporter;
  }

  error(message: string, error?: unknown, metadata?: ErrorMetadata): void {
    // eslint-disable-next-line no-console
    console.error(message, error);

    if (this.reporter === undefined) {
      return;
    }

    const extra: Record<string, unknown> = { message };
    if (metadata !== undefined) {
      if (metadata.action !== undefined) {
        extra['action'] = metadata.action;
      }
      if (metadata.payload !== undefined) {
        extra['payload'] = metadata.payload;
      }
      if (metadata.errors !== undefined) {
        extra['errors'] = metadata.errors;
      }
    }

    const tags: Record<string, string> = {};
    if (metadata?.action !== undefined) {
      tags['actionType'] = metadata.action;
    }

    this.reporter.captureException(error ?? new Error(message), {
      extra,
      tags: Object.keys(tags).length > 0 ? tags : undefined,
    });
  }

  debug(message: string, ...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.log(message, ...args);
  }

  setUser(user: UserContext | null): void {
    this.reporter?.setUser?.(user);
  }

  clearUser(): void {
    this.reporter?.setUser?.(null);
  }
}

/** Discards everything. Useful in tests and non-browser environments. */
export class NoopLogger implements Logger {
  error(): void {
    // noop
  }
  debug(): void {
    // noop
  }
  setUser(): void {
    // noop
  }
  clearUser(): void {
    // noop
  }
}

// Fallback instance used when no LoggerProvider is present.
const defaultLoggerInstance = new ConsoleLogger();

const LoggerContext = createContext<Logger>(defaultLoggerInstance);

export const LoggerProvider: React.FC<{
  children: ReactNode;
  logger?: Logger;
}> = ({ children, logger }) => {
  const loggerValue = useMemo(() => logger ?? defaultLoggerInstance, [logger]);

  return (
    <LoggerContext.Provider value={loggerValue}>
      {children}
    </LoggerContext.Provider>
  );
};

export const useLogger = (): Logger => {
  return useContext(LoggerContext);
};
