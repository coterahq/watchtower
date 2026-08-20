# `@cotera/watchtower-models` — viewmodels and scopes

A model is an object with a stable `id`, registered into a scope for as long as
the subtree that owns it is mounted, and found again by its **type** rather than
threaded down through props.

Peer: `react`. Depends on nothing else in WatchTower — models commonly hold
watchables, but that is convention, not a dependency.

## Defining a model

```ts
type Model = {
  id: string;
  resources?(): ModelResource[];
  developerDetails?(): DeveloperDetails;
  onCreate?(): void;    // after registration into a scope
  dispose?(): void;     // when the last registrant releases it
};

type TargetableModel = Model & {
  isTargeted: boolean;
  target(): void;
  markAsNotTargeted(): void;
};
```

`BaseModel` is an abstract class supplying just `id` via constructor. Implement
`Model` directly when you would rather not extend.

```tsx
class RunModel implements TargetableModel {
  readonly id: string;
  readonly title = Watchable.fromValue('Run Details');

  constructor(runKey: string) {
    this.id = `run-${runKey}`;
  }

  isTargeted = false;
  target = () => { this.isTargeted = true; };
  markAsNotTargeted = () => { this.isTargeted = false; };
}
```

The `id` must be stable across renders for the same logical thing, and unique
within its type — registration is keyed `` `${constructor.name}:${id}` ``.

## Registering

```tsx
<ModelScopeFactory createModels={() => [new RunModel(runKey)]} deps={[runKey]}>
  <RunTitle />
</ModelScopeFactory>
```

`createModels` runs **inside the effect**, and `deps` decides when it re-runs,
exactly like `useMemo`. This is the only scope component, and the shape is not
negotiable:

- a `models={[model]}` prop would be a fresh array every render, re-registering
  every render;
- instances built outside the effect get re-registered after a remount even
  though unmounting already disposed them — the "zombie model" React Strict Mode
  surfaces.

`ModelScopeFactory` renders `null` until registration completes, so children can
assume the model is present on first render.

If `createModels` returns a model equivalent to one already registered, the
existing instance stays live, the new one gets `dispose()`d immediately, and the
refcount increments. `onCreate()` fires only on the instance that actually
entered the scope.

## Reading

```ts
useInScopeModel<T>(modelClass, modelId?): T
useStatefullyAwareInScopeModel<T>(modelClass, modelId?): T | null
useTargetedModel<T extends TargetableModel>(modelClass): T | null
useModelScope(): ModelScopeManager        // throws with no provider
useModelScopeOrNull(): ModelScopeManager | null
```

**`useInScopeModel` is typed `=> T` but returns `null` at runtime when nothing
matches**, and does not re-render when the scope changes. It is the right hook
below a `ModelScopeFactory` that has already registered the model, and the wrong
one anywhere registration might lag — use `useStatefullyAwareInScopeModel`
there and handle the null.

Omit `modelId` to get the nearest model of that type. Scopes nest and lookups
walk up to the parent, so a component asks for "the run" and gets the one in
scope.

```tsx
function RunTitle() {
  const model = useInScopeModel(RunModel);
  return <h1>{useWatchableValue(model.title)}</h1>;
}
```

## Scopes

`ModelScopeProvider` owns a `ModelScopeManager` — the registry itself.

```tsx
<ModelScopeProvider>
  <App />
</ModelScopeProvider>
```

Mount this yourself **only when using models without actions**.
`ActionsRegistryProvider` from `@cotera/watchtower-actions` renders one
internally with the scope its actions read from; nesting another around or
inside it splits the registry in two and actions stop seeing your models.

Providers nest, and a nested one parents itself to the enclosing scope: lookups
walk up, and a child hears about changes in its parents, not the reverse. A
scope created by a provider is disposed when that provider unmounts; a scope
passed in via the `scope` prop is left alone, because someone else owns it.

Registration is refcounted. Two sibling subtrees registering the same model do
not tear it down for each other when the first unmounts; `dispose()` runs when
the last registrant leaves.

### Headless use

```ts
const scope = ModelScopeManager.create(parentScope?);
scope.addModels([new DocModel('a')]);        // returns the live instances
scope.getModelOfType(DocModel);              // T | null, walks up
scope.getInScopeModelsOfType(DocModel);      // T[], this scope then parents
scope.countInScopeModelsOfType(DocModel);
scope.isInScope(DocModel, id?);
scope.getAllInScopeModels();                 // this scope only, not parents
scope.removeModel(DocModel, 'a');            // decrements refcount
scope.setModels([...]);                      // replace everything here
scope.clearScope();
scope.subscribe((models) => {});             // returns unsubscribe
scope.dispose();                             // releases the parent link
```

Note the asymmetry: `getModelOfType` and `getInScopeModelsOfType` walk up to
parents, `getAllInScopeModels` does not.

## Targeting

Targeting answers "which one did the user mean" when several models of a type
coexist — a page and an artifact open beside it, or tabs kept mounted so their
editor state survives switching.

```tsx
const RunContext = createProvidedModelContext(RunModel, 'No run in scope');

<ModelTargetScope active={isVisibleTab}>
  <RunContext.Provider modelId={`run-${runKey}`}>
    <RunEditor />     {/* RunContext.useModel() here */}
  </RunContext.Provider>
</ModelTargetScope>
```

`createProvidedModelContext(modelClass, notFoundMessage)` returns
`{ Provider, useModel, useModelOrNull }`. The provider looks the model up once
and hands the instance to descendants through React context — prefer this over
repeated `useInScopeModel` calls when several same-type models share a scope.
`useModel` throws `notFoundMessage` when there is none; `useModelOrNull`
returns null, for components reused outside their owning page. Both fall back to
the targeted model when no provider is above them.

`ModelTargetScope active={...}` is what keeps targeting honest: mount order
would otherwise decide, so whichever mounted last would win regardless of what
is on screen and an action fired from anywhere could reach a hidden view. Inside
an inactive scope the provider *releases* targeting instead of holding it.
Outside any `ModelTargetScope` it defaults to true, so an ordinary page behaves
as expected.

Targeting is exclusive per type: `targetModel` clears the flag on every sibling
of that type first. Manager-level API: `targetModel`, `targetedModelOfType`,
`hasTargetedModelOfType`, `markAsNotTargeted`, `removeTargetForType`.

## Models in practice

**Private `Watchable`, public `ReadonlyWatchable`.** The dominant shape: the
model owns the writes, everything else gets a read-only view, and derived values
are computed in the model rather than in each component.

```ts
export class WorkflowModel extends BaseModel implements TargetableModel {
  readonly nameWatchable: ReadonlyWatchable<string>;
  readonly hasUnsavedChangesWatchable: ReadonlyWatchable<boolean>;

  private readonly _draftWatchable: Watchable<WorkflowDraft>;
  private readonly _baselineWatchable: Watchable<WorkflowDraft>;

  constructor({ workflowId, client, watchablesFactory }: WorkflowModelProps) {
    super(`workflow-${workflowId}`);
    this._draftWatchable = Watchable.fromValue(emptyDraft());
    this._baselineWatchable = Watchable.fromValue(emptyDraft());
    this.hasUnsavedChangesWatchable = Watchable.from(
      (get) => isDirty(get(this._draftWatchable), get(this._baselineWatchable))
    );
    …
  }
}
```

**Collaborators arrive as constructor props.** The API client, a query client,
the shared watchables factory, a URL adapter — the same injection actions use.
Keep the prop types narrow (`Pick<TenantedClient, 'resource'>`): it is what makes
the model testable without a network.

**`dispose()` releases subscriptions.** Anything with a timer or an event
subscription — an `EventWatchable`, a `PollingWatchable`, a child model — is
unsubscribed there. Nothing else runs when the last registrant leaves.

**A hook per model, next to the class.** Components import that rather than
repeating the lookup:

```ts
export const useAppModel = () => useInScopeModel(AppModel);
```

**Several models per scope, not one big one.** A page registers its main model
alongside small satellites — a selection model, an artifact model — from one
`createModels`, and passes watchables between them at construction:

```tsx
createModels={() => {
  const chat = new ChatModel({ conversationId, client });
  return [chat, new SelectionModel(), new QueueModel(chat.messagesWatchable)];
}}
deps={[conversationId]}
```

`key={conversationId}` on the factory forces a fresh scope when the identity of
the thing on screen changes, rather than mutating models in place.

**`resources()` is what a global search shows.** The app-shell model maps what it
already holds — recent chats, agents, documents, folders — into `ModelResource`s,
and `@cotera/watchtower-command-palette` picks them up with no further wiring.

**Sync components push React data in.** Route params, query results and feature
flags reach a model through a `null`-rendering component that sets them in an
effect and calls `targetModel`. Models never call React hooks.

## Developer details

An optional `developerDetails(): { title, entries: {key, value}[] }` on a model
feeds a debug panel.

```ts
getDeveloperDetailsFromInScopeModels(models): DeveloperDetails[]   // newest first
hasDeveloperDetails(model): model is ModelWithDeveloperDetails
```
