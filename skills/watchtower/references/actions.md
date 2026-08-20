# `@cotera/watchtower-actions` — context-aware actions

An action declares what it is called, when it applies, and what it does. It
reads the models currently in scope through its context, which is what lets one
action serve a command palette, a keyboard shortcut, a window event, and a
button without knowing which invoked it.

Peers: `react`, `zod` (v4), `neverthrow` (v8). Depends on
`@cotera/watchtower-models`, which comes along automatically — import `Model`,
`ModelScopeFactory`, and the model hooks from *there*, not from here.

## Writing an action

```tsx
type SavePayload = { note?: string };

class SaveRunAction extends BaseAction<SavePayload> {
  static readonly actionId = 'SaveRunAction';   // survives minification
  title = 'Save run';
  shortcut = ['ctrl', 's'];
  inputSchema = z.object({ note: z.string().optional() });

  applicable(context: ApplicableContext): boolean {
    return context.isInScope(RunModel);
  }

  async execute(
    payload: SavePayload,
    context: ExecuteContext
  ): Promise<ActionResult<{ t: string }[]>> {
    const run = context.getInScopeModelOfType(RunModel);
    if (run === null) return err([{ t: 'no-run' }]);
    await save(run, payload.note);
    return ok({});
  }
}
```

`BaseAction` requires `title`, `inputSchema`, `applicable`, and `execute`, and
supplies `requiresInputArgs()` and `askOrExecute()`. Everything else on the
`Action` type is optional.

**Never throw from `execute`.** It returns
`ActionResult<Errors> = Result<{ cancelled?, next?, resourceId?, output? }, Errors>`
where `Errors extends { t: string }[]`. Errors as values is what lets
`askOrExecute` log them through the `Logger` and hand them to the tracking
adapter at the boundary; a thrown error bypasses all of it.

`getInScopeModelOfType` returns `T | null` here — unlike the `useInScopeModel`
hook, the context is honest about it. Handle the null.

## Optional members

| Member | Effect |
| --- | --- |
| `description?: string` | shown in surfaces; also the tool description under the `chat` scope |
| `shortcut?: KeyName[]` | e.g. `['ctrl', 's']` — see Shortcuts below |
| `shortcutAvailable?(): boolean` | whether the binding may claim the keystroke at all |
| `icon?`, `group?` | presentation |
| `priority?: number` | static ordering, higher = more prominent |
| `getPriority?(ctx): number` | context-dependent ordering; wins over `priority` |
| `discrete?: boolean` | hide from the command palette |
| `scopes?: ActionScope[]` | `'general' \| 'chat' \| 'discrete'`; absent means general only |
| `events?: string[]` | window `CustomEvent` names that invoke it |
| `ask?`, `shouldAsk?` | input dialog; see below |
| `track?(ctx): ActionTrackMetadata \| null` | shape what gets recorded |
| `describeForAgent?(ctx): string \| null` | dynamic description for the `chat` scope |

`ActionScope` values: `general` is implied for every action and never needs
listing. `discrete` hides it from the palette. `chat` opts the action in to being
called by an agent — its `title`, `description`, and `inputSchema` become the
tool contract, so they must read well to a model, and it must not put a dialog in
the way (declare `shouldAsk(): false`, or provide no `ask`). Opting in *is* the
consent; there is no second prompt. `describeForAgent` exists because
`description` is static while the thing being acted on is not — name the concrete
subjects and their ids so a model can address one explicitly rather than relying
on whichever is targeted.

## Registering

```tsx
<ActionsRegistryProvider actions={[new SaveRunAction()]} trackingAdapter={analytics}>
  <ModelScopeFactory createModels={() => [new RunModel(runKey)]} deps={[runKey]}>
    <RunPage />   {/* SaveRunAction is now applicable */}
  </ModelScopeFactory>
</ActionsRegistryProvider>
```

`ActionsRegistryProvider` owns both registries — the actions and the
`ModelScopeManager` that answers "what is in scope" — and publishes the scope to
`@cotera/watchtower-models` internally, so `ModelScopeFactory` and
`useInScopeModel` resolve against the very registry the actions read. Do not
wrap it in your own `ModelScopeProvider`.

Props: `actions?`, `modelScope?` (a parent scope to nest under),
`trackingAdapter?`, `logger?`.

`Actions` registers additional actions for a subtree — mount it inside a page for
page-specific actions that disappear on unmount. Registration is refcounted the
same way models are, keyed by `static actionId ?? constructor.name`; the last
registrant wins as the live instance, and the key survives until every registrant
unregisters.

## Invoking

```tsx
function SaveButton() {
  const { execute, action } = useAction(SaveRunAction);
  return <button onClick={() => execute()}>{action.title}</button>;
}
```

`execute(payload?: Partial<P>)` runs `askOrExecute` and returns the `Result`. It
throws only if the action is not registered. `action` exposes live getters for
`title`, `icon`, and `shortcut`.

`useActionsContext()` returns the `ReadActionsContext` for building surfaces —
`getAllActions()`, the scope queries, `dispatchEvent`, `subscribe`.

A command palette filters with `applicable(context)` and orders by
`getPriority?.(context) ?? priority` — which is exactly what
`@cotera/watchtower-command-palette` does, so do not write that loop by hand
(`references/command-palette.md`).

## Asking for input

An action whose schema has required fields cannot run from a bare `execute()`.
`requiresInputArgs()` derives from the schema — it is true unless the schema is
a `z.ZodObject` whose every field is `.optional()`. When it is true and `ask` is
defined, `askOrExecute` renders the dialog and resolves once the user responds.

```ts
ask = (params, context): AskResponse<P> => ({
  view: ({ onRespond, onCancel }) => openDialog({ onRespond, onCancel }),
});
```

Cancelling resolves `ok({ cancelled: true })` — a success, not an error. Check
it before treating the action as done.

`shouldAsk(context)` overrides the schema-derived decision per invocation.
Careful: merely *defining* `shouldAsk` routes the action down the ask path
regardless of the schema, and if it then returns true while `ask` is undefined,
`askOrExecute` dereferences the missing `ask` and throws. Define the two
together, or neither.

## Shortcuts

Bound automatically from each action's `shortcut` array. Modifiers normalise to
`'ctrl'` (both Control and Meta), `'shift'`, `'alt'`; specials to `'space'`,
`'esc'`, `'up'`, `'down'`, `'left'`, `'right'`; everything else is the lowercased
key. Matching is exact — `['ctrl','a']` does not fire on Ctrl+Shift+A.

**`shortcutAvailable()` and `applicable()` are not interchangeable.**
`shortcutAvailable` is consulted *before* the keystroke is consumed;
`preventDefault` has already run by the time `applicable` is checked. Harmless
for a chord nothing else wants (Ctrl-S), destructive for one the browser and
every text field also use — an inapplicable action still swallows Cmd-C over
selected text. Returning false from `shortcutAvailable` leaves the event alone.

Only one non-modifier key is tracked at a time, deliberately: macOS withholds
`keyup` while Command is held, so the `c` of a Cmd-C would still read as pressed
when the following Cmd-V arrives, and an exact-match check would fire neither.

## Window events

An action listing `events: ['my-event']` is invoked by
`window.dispatchEvent(new CustomEvent('my-event', { detail: payload }))`, with
`event.detail` as the payload. `context.dispatchEvent(event)` does the same but
returns an error result when no registered action listens for that type.

Both shortcuts and window events evaluate `applicable()` against a **fresh
manager** built by `ActionsManager.fromExisting(context)`, holding the same
actions and a copy of the current models. That is what makes an action see the
scope as it is at keypress time rather than at render time.

## How they get used

The patterns below are what ~140 actions in one large client converged on. None
are enforced by the types; all of them are worth copying.

**Collaborators come through the constructor, models through the context.**

```tsx
const actions = useMemo(
  () => [
    new RenameDatasetAction(client, modalManager, orgId),
    new SaveWorkflowAction(client, queryClient),
  ],
  [client, modalManager, orgId, queryClient]
);
```

An action is a long-lived object, not a hook, so anything React-shaped — the API
client, the modal manager, a router — is injected once where it is in scope. What
the action operates *on* is different: that is read from `ApplicableContext` /
`ExecuteContext` at call time, because it changes with the screen.

**A helper per lookup, not a lookup per action.** Each feature exports the
readers its actions share, so `getInScopeModelOfType` appears once:

```ts
export function workflowModelFromContext(context: ApplicableContext) {
  return context.getInScopeModelOfType(WorkflowModel);
}
```

Actions that name a *targeted* model use `targetedModelOfType`, and return null —
"cannot act" — rather than falling back to an unnarrowed call. A helper returning
null is the honest answer when the user's subject is ambiguous.

**A base class per family.** Actions sharing a payload shape and an applicability
rule get a small abstract class over `BaseAction`, which is also where the empty
schema lives:

```ts
export abstract class WorkflowToolbarActionBase<
  Errors extends { t: string }[] = { t: string }[]
> extends BaseAction<Record<string, never>, Errors> {
  inputSchema = z.object({});
  abstract override applicable(context: ApplicableContext): boolean;
}
```

**Two tiers of registration.** App-wide actions on `ActionsRegistryProvider` at
the root; page actions on `<Actions>` inside the route, wrapped around the
`ModelScopeFactory` that registers what they act on. Both disappear together on
unmount.

**`applicable` drives rendering, not just the palette.** A toolbar asks the
registry rather than the props:

```tsx
const registered = context.getAction(actionConstructor);
if (registered === undefined || registered.applicable(context) === false) {
  return null;                       // no button for something that cannot run
}
```

That is the payoff of declaring applicability once: the palette, the shortcut and
the button agree by construction.

**`getPriority` for "the thing on screen".** Static `priority` is rare; the
common shape is a context-dependent bump so an action about the targeted model
sorts above the generic ones:

```ts
getPriority(context: ApplicableContext): number {
  return this.targetDatasetId(context) !== null ? 20 : 0;
}
```

**`shouldAsk(): true` plus `ask` is the normal dialog.** Most actions that ask do
not derive it from the schema — they declare `shouldAsk` and render a modal from
`ask`, then `execute` with what came back. Define the pair together; `shouldAsk`
without `ask` throws.

**Window events are the escape hatch, not the norm.** `useAction` covers almost
everything; `events` is for code with no view in reach — a URL handler, a
non-React module.

**Sync components push React data in.** Route params and query results reach a
model through a `null`-rendering component that also calls
`context.targetModel(model)` in its effect.

## Tracking and logging

```ts
trackingAdapter: { track(params: ActionTrackingParams<P, Errors>): void }
```

Receives every executed action with `action`, `payload`, `context`, `result`, and
whatever the action's own `track(context)` returned as `metadata`. Defaults to a
no-op adapter.

```tsx
const logger = new ConsoleLogger({
  captureException: (error, ctx) =>
    Sentry.captureException(error, { extra: ctx.extra, tags: ctx.tags }),
  setUser: (user) => Sentry.setUser(user),
});

<LoggerProvider logger={logger}>
  <ActionsRegistryProvider actions={actions} trackingAdapter={analytics}>
    <App />
  </ActionsRegistryProvider>
</LoggerProvider>
```

`Logger` is `{ error, debug, setUser, clearUser }`. `ConsoleLogger` writes to the
console and, given an `ErrorReporter`, forwards errors with the action name,
payload, and flattened typed errors attached. `NoopLogger` discards everything —
use it in tests and non-browser environments. `useLogger()` reads the nearest
one; with no `LoggerProvider` it is a bare `ConsoleLogger`.

Note `ActionsRegistryProvider` memoises its manager on `[logger]` only — changing
the `actions` array identity after mount does not rebuild the registry. Register
per-subtree actions with `Actions` rather than by mutating that prop.
