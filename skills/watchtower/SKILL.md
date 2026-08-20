---
name: watchtower
description: Build React state with WatchTower — observable values (watchables), viewmodels (models), context-aware actions, and the command palette over them. Use when working with @cotera/watchtower, @cotera/watchtower-events, @cotera/watchtower-models, @cotera/watchtower-actions, @cotera/watchtower-query, or @cotera/watchtower-command-palette, or with Watchable, useWatchableValue, ReadonlyWatchable, EventWatchable, PollingWatchable, MixedSourceWatchable, WatchableRecord, QueryWatchable, ModelScopeFactory, ModelScopeManager, useInScopeModel, BaseAction, ActionsRegistryProvider, or useCommandPalette.
version: 0.1.0
---

# WatchTower

Observable values, viewmodels, and context-aware actions for React. Every
watchable is a jotai atom underneath; the library adds the two things jotai
leaves to you — where state lives and how it is reached, and how it connects to
the outside world.

## Two independent halves

```
watchtower ←── watchtower-events ←── watchtower-query     (values)
       ↖________________________________/

watchtower-models ←── watchtower-actions                  (structure)
                              ↑
                   watchtower-command-palette             (a surface over both)
```

Neither half depends on the other. Models hold watchables by convention, not by
dependency, so either can be adopted alone. Do not tell a user they need models
to use watchables, or the reverse.

## Pick the layer before writing code

| The problem | Reach for | Package |
| --- | --- | --- |
| A value other values derive from | `Watchable.fromValue` / `Watchable.from` | `@cotera/watchtower` |
| A value that must be refetched on a timer | `PollingWatchable.create` | `@cotera/watchtower` |
| A value the user edits *and* a stream updates | `MixedSourceWatchable.from` | `@cotera/watchtower` |
| A value surviving reload (localStorage etc.) | `PersistentWatchable.fromStorage` | `@cotera/watchtower` |
| An object whose fields are subscribed separately | `WatchableRecord.fromValue` | `@cotera/watchtower` |
| A value the server owns, pushed over WS/SSE | `EventWatchable.for` | `@cotera/watchtower-events` |
| …the same, plus optimistic writes | `TwoWayEventWatchable.for` | `@cotera/watchtower-events` |
| Reading a TanStack query outside a component | `QueryWatchable.for` | `@cotera/watchtower-query` |
| An event that should bust TanStack cache prefixes | `QueryClientEventWatchable.for` | `@cotera/watchtower-query` |
| "The run this part of the screen is about" | a model + `ModelScopeFactory` | `@cotera/watchtower-models` |
| One operation serving palette + shortcut + button | `BaseAction` subclass | `@cotera/watchtower-actions` |
| Ctrl-K over what applies right now | `useCommandPalette` | `@cotera/watchtower-command-palette` |

If the answer is "plain derived state and nothing else", stop at
`@cotera/watchtower`. Every package past it exists to handle a failure mode; do
not pull one in before the app has that failure mode.

## Setup

```bash
bun add @cotera/watchtower
bun add jotai react            # peers — the app owns the versions
```

Peers, plural copies, one store: a watchable's value lives in a single
module-level jotai store created inside `@cotera/watchtower`. Two copies of that
package in the tree means two stores, and subscriptions in one are silently
invisible to the other. Keep `react` and `jotai` deduped, and never bundle
`@cotera/watchtower` into a library that also ships it as a dependency.

No package has a build step — they ship TypeScript sources with no `dist`. Bun
and Vite consume them directly. **Under Next.js, add every `@cotera/watchtower*`
package to `transpilePackages`** or the build fails on untranspiled TS.

Provider stack, when using models or actions:

```tsx
<LoggerProvider logger={logger}>            {/* optional, -actions */}
  <ActionsRegistryProvider actions={actions} trackingAdapter={analytics}>
    <App />                                  {/* provides the model scope too */}
  </ActionsRegistryProvider>
</LoggerProvider>
```

`ActionsRegistryProvider` renders a `ModelScopeProvider` internally with the
scope its actions read from. **Never nest your own `ModelScopeProvider` around
or inside it to "add models"** — that creates a second registry, and an action
asking what is in scope will not see models registered into the other one. Using
models *without* actions is the only case where you mount `ModelScopeProvider`
yourself.

## The shape this takes in a real app

From the client it was extracted from — ~140 action classes, ~50 models, ~470
`useWatchableValue` call sites. Reach for the same shape by default; the
per-layer references have the detail.

**Interaction is an action, not a handler.** Anything a user does that is not
purely local to one component gets a `BaseAction` subclass in a
`something.action.ts` beside the feature. The component keeps the markup:

```tsx
const { execute } = useAction(SaveWorkflowAction);
<Button onClick={() => void execute()} />
```

That is worth doing because of what comes free with the declaration: the command
palette lists it, `shortcut` binds it, `applicable(context)` decides whether the
toolbar button renders at all, the tracking adapter sees every run, and `scopes:
['chat']` hands the same operation to an agent. A plain `onClick` gets none of
it. Keep the *component's own* state in the component; a disclosure toggle is not
an action.

**State lives on models, as watchables.** A page's model holds private
`Watchable`s and exposes `ReadonlyWatchable`s; components read them with
`useWatchableValue`, actions read them with `snapshot()`. Module-level watchables
are for genuinely process-wide values only.

**Two tiers of registration.** App-wide actions and models at the root; a page
mounts its own inside its route, so they disappear on unmount:

```tsx
<Actions actions={pageActions}>                    {/* -actions */}
  <ModelScopeFactory createModels={createModels} deps={deps} key={id}>
    <PageContent />
  </ModelScopeFactory>
</Actions>
```

**Actions take their collaborators through the constructor** — the API client,
the modal manager, the query client, the org id — and are instantiated once in a
`useMemo` where those are in scope. They read *models* from the context passed to
`applicable` and `execute`, never from React.

**One helper per model lookup, not a lookup per action.** A feature exports
`workflowModelFromContext(context)` / `targetedTriggerNode(context)` and its
actions call that. A family of actions that share a payload shape and an
applicability rule gets a small abstract base class extending `BaseAction`.

**Null-rendering sync components bridge React into models.** Route params, query
results and feature flags reach a model through a component that renders `null`
and pushes them in an effect — that is also where `targetModel` is called:

```tsx
const Sync: React.FC<{ name: string }> = ({ name }) => {
  const selection = useInScopeModel(ResourceSelectionModel);
  const context = useActionsContext();
  useEffect(() => {
    selection.setName(name);
    context.targetModel(selection);
  }, [selection, name, context]);
  return null;
};
```

**Then Ctrl-K is free.** `useCommandPalette` reads the same two registries — see
`references/command-palette.md`.

## Rules that the types do not enforce

These are the failures that compile clean and break at runtime.

**Class names are identity.** A model is keyed by `model.constructor.name`; an
action by `static actionId ?? constructor.name`. Any build step that mangles
class names breaks every lookup — `useInScopeModel(RunModel)` finds nothing.
Configure the minifier to preserve them — `keep_classnames` in terser, `keepNames`
in esbuild (Vite's default minifier, which does **not** set it for you). Actions
have an escape hatch, models do not:

```ts
class SaveRunAction extends BaseAction<SavePayload> {
  static readonly actionId = 'SaveRunAction';   // survives mangling
}
```

**`useInScopeModel` lies about null.** It is typed `=> T` but returns whatever
`getModelOfType` found, which is `null` when nothing is registered. It does not
throw — you get a null typed as the model and crash on first property access.
It also does not re-render when the scope changes. Use it only below a
`ModelScopeFactory` that has already registered the model; reach for
`useStatefullyAwareInScopeModel` (returns `T | null`, re-renders on scope
change) when registration may lag the read.

**Derived watchables have no setter.** `Watchable.from` returns
`ReadonlyWatchable<T>` — `snapshot`, `subscribe`, `map`, `asAtom`, and nothing
else. That is deliberate. If you need "derived, but the user can override",
that is `MixedSourceWatchable`, not a writable derived value.

**`Watchable.fromValue` never dedupes by default.** The default equality is
`() => false`, so every `set` writes and notifies even with an identical value.
Pass `equalityFn` when a hot path re-sets the same value. (`PersistentWatchable`
differs — it defaults to `a === b`.)

**`set` runs the updater, `setFromSource` does not.** When syncing from an
external source of truth that is already current — a URL parameter, a server
frame — use `setFromSource` so the updater does not write straight back to it.

**Actions never throw; they return `Result`.** `execute` returns
`ActionResult<Errors>` from neverthrow. Errors are values, and the framework
logs and tracks them at the boundary. An action that throws bypasses all of it.

**`ModelScopeFactory` takes a factory and deps, never instances.** A
`models={[model]}` prop is a fresh array each render and re-registers each
render; instances built outside the effect get re-registered after a remount
even though unmounting disposed them — the zombie model React Strict Mode
surfaces. Pass the values the models are built from as `deps`, like `useMemo`.

## Reference files

Read the one that matches the layer in play; each documents the full exported
surface and the failure modes specific to it.

| File | Covers |
| --- | --- |
| `references/watchables.md` | `Watchable` and every variant, hooks, the store |
| `references/events.md` | event bus, `EventWatchable`, `TwoWayEventWatchable`, live-stream failure modes |
| `references/models.md` | models, scopes, lookup by type, targeting |
| `references/actions.md` | `BaseAction`, applicability, `ask`, shortcuts, window events, tracking, logging |
| `references/query.md` | `QueryWatchable`, `QueryClientEventWatchable`, prefix invalidation |
| `references/command-palette.md` | `useCommandPalette`, entries and sections, ranking, triggers |
| `references/testing.md` | resetting the bus, headless scopes, Strict Mode, fake timers |

## Style to match

The codebase is TypeScript with explicit return types on exported functions,
`type` over `interface` for data shapes, named exports only, and comments that
explain *why* a thing is the way it is rather than restating the code. Follow
it. When adding a variant or option, document the failure mode it handles —
that is the organising principle of the whole library.
