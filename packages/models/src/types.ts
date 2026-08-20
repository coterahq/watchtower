/**
 * A viewmodel: an object with a stable id that can be registered into a scope
 * and found again by its type.
 *
 * Models usually hold their state in watchables from `@cotera/watchtower`, but
 * nothing here requires that — a model is whatever you register.
 */
export type Model = {
  id: string;

  resources?(): ModelResource[];

  developerDetails?(): DeveloperDetails;

  /** Called once the model has been registered into a scope. */
  onCreate?(): void;

  /** Called when the last registrant releases the model. */
  dispose?(): void;
};

/**
 * A model that can be marked as the one the user means, when several of its
 * type are in scope at once.
 */
export type TargetableModel = {
  isTargeted: boolean;

  target(): void;

  markAsNotTargeted(): void;
} & Model;

export type ModelConstructor<T extends Model = Model> = {
  new (...args: any[]): T;
};

/** Something a model exposes as a navigable destination. */
export type ModelResource = {
  name: string;
  description?: string;
  group?: string;
  icon?: string;
  priority?: number;
} & ({ t: 'tab'; tabRoute: string } | { t: 'link'; url: string });

export type DeveloperDetailEntry = {
  key: string;
  value: string;
};

export type DeveloperDetails = {
  title: string;
  entries: DeveloperDetailEntry[];
};
