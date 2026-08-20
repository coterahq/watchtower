# @cotera/watchtower-models

The WatchTower viewmodel layer.

A model is an object with a stable id, registered into a scope for as long as
the subtree that owns it is mounted, and found again by its *type* rather than
by threading a reference down the tree.

Models commonly hold their state in watchables from
[`@cotera/watchtower`](../watchtower), but this package does not depend on them
— a model is whatever you register. Pair it with
[`@cotera/watchtower-actions`](../actions) to give actions something to read.

## Install

```bash
bun add @cotera/watchtower-models
bun add react   # peer
```

## Models

A model is a viewmodel: an object with an `id`, usually holding watchables, put
into scope for the subtree that owns it. A `ModelScopeProvider` at the app root
owns the registry they go into — see [Scopes](#scopes).

```tsx
import {
  ModelScope,
  useInScopeModel,
  type TargetableModel,
} from '@cotera/watchtower-models';
import { Watchable, useWatchableValue } from '@cotera/watchtower';

class RunModel implements TargetableModel {
  readonly id: string;
  readonly title = Watchable.fromValue('Run Details');

  constructor(runKey: string) {
    this.id = `run-${runKey}`;
  }

  isTargeted = false;
  target = () => {
    this.isTargeted = true;
  };
  markAsNotTargeted = () => {
    this.isTargeted = false;
  };
}

function RunPage({ runKey }: { runKey: string }) {
  const model = useMemo(() => new RunModel(runKey), [runKey]);

  // registers `model` for as long as this page is mounted
  return (
    <ModelScope models={[model]}>
      <RunTitle />
    </ModelScope>
  );
}

function RunTitle() {
  const model = useInScopeModel(RunModel);
  return <h1>{useWatchableValue(model.title)}</h1>;
}
```

Scopes nest, and lookups walk up to the parent — a component asks for a model
_type_ and gets the nearest one. Registration is refcounted, so two sibling
subtrees registering the same model do not tear it down for each other when the
first unmounts. `dispose()` runs when the last registrant leaves.

`ModelScopeFactory` takes a factory instead of instances, creating fresh models
inside the effect. Prefer it when models must not survive a remount — React
Strict Mode otherwise leaves a disposed model registered.

**Targeting** answers "which one did the user mean" when several models of a
type coexist. `createProvidedModelContext` hands descendants a specific instance
and marks it targeted, while `ModelTargetScope` gates that on whether the
subtree is actually the visible one — so a hidden tab releases targeting instead
of holding it forever by virtue of having mounted last.

```tsx
const RunContext = createProvidedModelContext(RunModel, 'No run in scope');

<ModelTargetScope active={isVisibleTab}>
  <RunContext.Provider modelId={`run-${runKey}`}>
    <RunEditor />
  </RunContext.Provider>
</ModelTargetScope>;
```

## Scopes

`ModelScopeProvider` owns a `ModelScopeManager` — the registry itself. Every
lookup, registration, and targeting call goes through it, and the hooks read the
nearest one.

```tsx
<ModelScopeProvider>
  <App />
</ModelScopeProvider>
```

`ActionsRegistryProvider` from [`@cotera/watchtower-actions`](../actions)
renders one of these internally with the scope its actions read from, so the two
layers share a single registry — you do not nest them yourself.

Providers nest, and a nested one parents itself to the enclosing scope: lookups
walk up, and a child hears about changes in its parents (it can see their
models) but not the reverse. A scope created by a provider is disposed when that
provider unmounts.

For work outside React — a test, or a headless caller — build one directly:

```ts
const scope = ModelScopeManager.create();
scope.addModels([new DocModel('a')]);
scope.getModelOfType(DocModel);
scope.subscribe((models) => console.log(models.length));
```

## Development

```bash
bun install       # from the workspace root
bun run test:run
bun run typecheck
```
