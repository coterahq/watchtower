/**
 * WatchTower actions — context-aware operations.
 *
 * An action declares what it is called, when it applies, and what it does. It
 * reads the models currently in scope through its context, which is what lets
 * one action be invoked from a command palette, a keyboard shortcut, a window
 * event, or a button without knowing which.
 *
 * Models come from `@cotera/watchtower-models`; this package registers a scope
 * of them alongside its action registry.
 */
export {
  type ActionConstructor,
  type ActionPayload,
  type ExecuteContext,
  type ApplicableContext,
  type ReadActionsContext,
  type FullActionsContext,
  type Action,
  type AskResponse,
  type AskViewType,
  type ActionResult,
  type ActionTrackMetadata,
  type ActionScope,
} from './types';
export * from './context';
export * from './action.base';
export * from './actions.manager';
export * from './action-tracking';
export * from './use-action';
export * from './use-keyboard-shortcuts';
export * from './use-window-events';
export {
  ConsoleLogger,
  NoopLogger,
  LoggerProvider,
  useLogger,
  type Logger,
  type ErrorMetadata,
  type ErrorReporter,
  type UserContext,
} from './logger';
