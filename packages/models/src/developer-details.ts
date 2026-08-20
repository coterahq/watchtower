import type { DeveloperDetails, Model } from './types';

export type ModelWithDeveloperDetails = Model & {
  developerDetails(): DeveloperDetails;
};

export const hasDeveloperDetails = (
  model: Model
): model is ModelWithDeveloperDetails => {
  return (
    typeof (model as ModelWithDeveloperDetails).developerDetails === 'function'
  );
};

/**
 * Collects developer details from in-scope models, newest first. In-scope models
 * are stored with the most recently added at the end of the array.
 */
export const getDeveloperDetailsFromInScopeModels = (
  models: Model[]
): DeveloperDetails[] => {
  return [...models]
    .reverse()
    .filter(hasDeveloperDetails)
    .map((model) => model.developerDetails());
};
