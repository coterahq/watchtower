import { Model, ModelConstructor, TargetableModel } from './types';

/**
 * A registry of live models, addressable by type.
 *
 * Scopes nest: a lookup that misses walks up to the parent, so a component asks
 * for a model *type* and gets the nearest one. Registration is refcounted —
 * two subtrees registering the same model do not tear it down for each other
 * when the first unmounts, and `dispose()` runs only when the last registrant
 * leaves.
 */
export class ModelScopeManager {
  private refCounts = new Map<string, number>();
  private subscribers: ((models: Model[]) => void)[] = [];
  private unsubscribeFromParent: (() => void) | undefined;

  private constructor(
    private models: Map<string, Model> = new Map(),
    private modelsByType: Map<string, Model[]> = new Map(),
    private parentModelScope?: ModelScopeManager
  ) {}

  static create(parentModelScope?: ModelScopeManager): ModelScopeManager {
    const scope = new ModelScopeManager(new Map(), new Map(), parentModelScope);
    // Lookups walk up, so a change in the parent is a change here too. The
    // reverse does not hold: an ancestor cannot see this scope's models.
    scope.unsubscribeFromParent = parentModelScope?.subscribe(() =>
      scope.notify()
    );
    return scope;
  }

  /** Releases the link to the parent scope. Call when the scope goes away. */
  dispose(): void {
    this.unsubscribeFromParent?.();
    this.unsubscribeFromParent = undefined;
    this.subscribers = [];
  }

  subscribe(callback: (models: Model[]) => void): () => void {
    this.subscribers.push(callback);

    return () => {
      this.subscribers = this.subscribers.filter((cb) => cb !== callback);
    };
  }

  /** Announces the current model set to this scope's subscribers. */
  notify(): void {
    this.subscribers.forEach((cb) => {
      cb(this.getAllInScopeModels());
    });
  }

  private addModelWithoutNotifying<T extends Model>(model: T): T {
    const typeKey = model.constructor.name;
    const fullId = `${typeKey}:${model.id}`;
    const existing = this.models.get(fullId);

    if (existing !== undefined) {
      const count = (this.refCounts.get(fullId) ?? 1) + 1;
      this.refCounts.set(fullId, count);
      return existing as T;
    }

    if (!this.modelsByType.has(typeKey)) {
      this.modelsByType.set(typeKey, []);
    }

    const typeModels = this.modelsByType.get(typeKey)!;
    this.models.set(fullId, model);
    typeModels.push(model);
    this.refCounts.set(fullId, 1);
    return model;
  }

  addModel<T extends Model>(model: T): T {
    const actual = this.addModelWithoutNotifying(model);
    this.notify();
    return actual;
  }

  /**
   * Registers several models and announces once, rather than once per model.
   * Returns the live instance for each — which is the one already in scope when
   * an equivalent model was registered before.
   */
  addModels(models: Model[]): Model[] {
    const actual = models.map((model) => this.addModelWithoutNotifying(model));
    this.notify();
    return actual;
  }

  removeModel(modelConstructor: ModelConstructor, modelId: string): void {
    const fullId = `${modelConstructor.name}:${modelId}`;
    const model = this.models.get(fullId);
    if (model === undefined) {
      return;
    }

    const count = (this.refCounts.get(fullId) ?? 1) - 1;
    this.refCounts.set(fullId, count);

    if (count > 0) {
      return;
    }

    this.refCounts.delete(fullId);
    model.dispose?.();

    this.models.delete(fullId);
    const typeModels = this.modelsByType.get(model.constructor.name);
    if (typeModels) {
      const index = typeModels.findIndex((m) => m.id === modelId);
      if (index >= 0) {
        typeModels.splice(index, 1);
      }
    }

    this.notify();
  }

  /** Replaces everything in this scope in one go. */
  setModels(models: Model[]): void {
    this.clearScopeWithoutNotifying();
    models.forEach((model) => this.addModelWithoutNotifying(model));
    this.notify();
  }

  private clearScopeWithoutNotifying(): void {
    this.models.clear();
    this.modelsByType.clear();
    this.refCounts.clear();
  }

  clearScope(): void {
    this.clearScopeWithoutNotifying();
    this.notify();
  }

  isInScope(modelConstructor: ModelConstructor, id?: string): boolean {
    const model = this.getModelOfType(modelConstructor, id);
    return !!model;
  }

  countInScopeModelsOfType<T extends Model>(
    modelConstructor: ModelConstructor<T>
  ): number {
    const models = this.modelsByType.get(modelConstructor.name);
    return (
      (models?.length ?? 0) +
      (this.parentModelScope?.countInScopeModelsOfType(modelConstructor) ?? 0)
    );
  }

  getAllInScopeModels(): Model[] {
    return Array.from(this.models.values());
  }

  /**
   * Get all models of a given type in the scope (including parent scopes).
   * Returns an empty array when none are present.
   */
  getInScopeModelsOfType<T extends Model>(
    modelConstructor: ModelConstructor<T>
  ): T[] {
    return this.getModelsOfType(modelConstructor);
  }

  getModelOfType<T extends Model>(
    modelConstructor: ModelConstructor<T>,
    id?: string
  ): T | null {
    if (id) {
      const fullId = `${modelConstructor.name}:${id}`;
      const model = this.models.get(fullId);
      return model && model.constructor.name === modelConstructor.name
        ? (model as T)
        : this.parentModelScope?.getModelOfType<T>(modelConstructor, id) ??
            null;
    }

    // Return the first model of this type if no ID specified
    const models = this.modelsByType.get(modelConstructor.name);
    return models && models.length > 0
      ? (models[0] as T)
      : this.parentModelScope?.getModelOfType<T>(modelConstructor) ?? null;
  }

  /**
   * Marks `model` as the targeted one of its type, clearing the flag on its
   * siblings first so exactly one is ever targeted.
   */
  targetModel<T extends TargetableModel>(model: T): void {
    if (!this.isInScope(model.constructor as ModelConstructor<T>)) {
      return;
    }

    this.getInScopeModelsOfType(
      model.constructor as ModelConstructor<T>
    ).forEach((m) => {
      m.markAsNotTargeted();
    });

    model.target();

    this.notifyOwnerOf(model);
  }

  targetedModelOfType<T extends TargetableModel>(
    modelConstructor: ModelConstructor<T>
  ): T | null {
    if (!this.isInScope(modelConstructor)) {
      return null;
    }

    return (
      this.getInScopeModelsOfType(modelConstructor).find((m) => m.isTargeted) ??
      null
    );
  }

  hasTargetedModelOfType<T extends TargetableModel>(
    modelConstructor: ModelConstructor<T>
  ): boolean {
    return this.targetedModelOfType(modelConstructor) !== null;
  }

  markAsNotTargeted<T extends TargetableModel>(model: T): void {
    model.markAsNotTargeted();
    this.notifyOwnerOf(model);
  }

  removeTargetForType<T extends TargetableModel>(
    modelConstructor: ModelConstructor<T>
  ): void {
    const owners = new Set<ModelScopeManager>();
    this.getInScopeModelsOfType(modelConstructor).forEach((m) => {
      m.markAsNotTargeted();
      owners.add(this.ownerOf(m));
    });
    owners.forEach((owner) => owner.notify());
  }

  protected getModelsOfType<T extends Model>(
    modelConstructor: ModelConstructor<T>
  ): T[] {
    const models = this.modelsByType.get(modelConstructor.name) ?? [];
    return [
      ...(models as T[]),
      ...(this.parentModelScope?.getModelsOfType<T>(modelConstructor) ?? []),
    ];
  }

  /**
   * The scope that actually holds `model`. Targeting mutates the model itself,
   * so the announcement belongs where the model lives — announcing it here
   * would leave the owning scope's other subscribers none the wiser.
   */
  protected ownerOf(model: Model): ModelScopeManager {
    const fullId = `${model.constructor.name}:${model.id}`;
    if (this.models.has(fullId)) {
      return this;
    }
    return this.parentModelScope?.ownerOf(model) ?? this;
  }

  private notifyOwnerOf(model: Model): void {
    this.ownerOf(model).notify();
  }
}
