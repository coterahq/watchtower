/**
 * WatchTower models — the viewmodel layer.
 *
 * A model is an object with a stable id, registered into a scope for as long as
 * the subtree that owns it is mounted, and found again by its type. Scopes
 * nest, registration is refcounted, and a model may be *targeted* so callers
 * know which of several same-type models the user means.
 *
 * This package stands on its own: models commonly hold their state in
 * watchables from `@cotera/watchtower`, but nothing here depends on them. Pair
 * it with `@cotera/watchtower-actions` to give actions something to read.
 */
export {
  type Model,
  type ModelConstructor,
  type TargetableModel,
  type ModelResource,
  type DeveloperDetailEntry,
  type DeveloperDetails,
} from './types';
export * from './model.base';
export * from './model-scope.manager';
export * from './model-scope.context';
export * from './model-scope';
export * from './model-target-scope';
export * from './provided-model';
export * from './use-in-scope-model';
export {
  getDeveloperDetailsFromInScopeModels,
  hasDeveloperDetails,
  type ModelWithDeveloperDetails,
} from './developer-details';
