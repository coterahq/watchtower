# @cotera/watchtower-actions

Context-aware actions for WatchTower.

An action declares what it is called, when it applies, and what it does. It
reads the models currently in scope through its context, which is what lets one
action be invoked from a command palette, a keyboard shortcut, a window event,
or a button without knowing which.

Actions read models, so this package depends on
[`@cotera/watchtower-models`](../models) and provides a model scope for you.

## Install

```bash
bun add @cotera/watchtower-actions
bun add react zod neverthrow   # peers
```

`@cotera/watchtower-models` comes along as a dependency; import `Model`,
`ModelScopeFactory`, and the model hooks from there.

## Actions

`RunModel` below is a model from [`@cotera/watchtower-models`](../models); the
action finds it by type rather than being handed it.

```tsx
import {
  BaseAction,
  ActionsRegistryProvider,
  useAction,
  type ActionResult,
  type ApplicableContext,
  type ExecuteContext,
} from '@cotera/watchtower-actions';
import { ok } from 'neverthrow';
import { z } from 'zod';

type SavePayload = { note?: string };

class SaveRunAction extends BaseAction<SavePayload> {
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
    await save(run, payload.note);
    return ok({});
  }
}

<ActionsRegistryProvider actions={[new SaveRunAction()]}>
  <App />
</ActionsRegistryProvider>;

function SaveButton() {
  const { execute, action } = useAction(SaveRunAction);
  return <button onClick={() => execute()}>{action.title}</button>;
}
```

`execute` returns a `Result` from [neverthrow](https://github.com/supermacro/neverthrow):
errors are values, and the framework logs and tracks them for you rather than
letting them throw past the call site.

An action that needs input can define `ask`, which renders a dialog and resolves
once the user responds; `requiresInputArgs()` derives from the schema, so an
all-optional schema runs straight through. `shouldAsk(context)` overrides that
per invocation.

`Actions` registers additional actions for a subtree — mount it inside a page to
add page-specific actions that disappear when the page unmounts. Registration is
refcounted the same way models are.

Shortcuts are bound from the action's `shortcut` array. `shortcutAvailable()`
is consulted _before_ the keystroke is consumed, which matters for keys the
browser also wants: returning false leaves `Cmd-C` alone entirely, where an
inapplicable `applicable()` would still have swallowed it.

## Tracking and logging

`trackingAdapter` receives every executed action with its payload and result —
wire it to your analytics. An action can shape what gets recorded through its
own `track(context)` method.

`logger` takes any `Logger`. The default `ConsoleLogger` writes to the console
and, given an `ErrorReporter`, forwards errors to your tracker:

```ts
const logger = new ConsoleLogger({
  captureException: (error, ctx) =>
    Sentry.captureException(error, { extra: ctx.extra, tags: ctx.tags }),
  setUser: (user) => Sentry.setUser(user),
});

<LoggerProvider logger={logger}>
  <ActionsRegistryProvider actions={actions} trackingAdapter={analytics}>
    <App />
  </ActionsRegistryProvider>
</LoggerProvider>;
```

## How it fits with models

`ActionsRegistryProvider` owns both registries: the actions themselves, and the
`ModelScopeManager` that answers "what is in scope". It publishes that scope to
[`@cotera/watchtower-models`](../models) internally, so `<ModelScopeFactory>`
and `useInScopeModel` from that package resolve against the very registry the
actions read.

```tsx
import { ActionsRegistryProvider } from '@cotera/watchtower-actions';
import { ModelScopeFactory } from '@cotera/watchtower-models';

<ActionsRegistryProvider actions={[new SaveRunAction()]}>
  <ModelScopeFactory createModels={() => [new RunModel(runKey)]} deps={[runKey]}>
    <RunPage /> {/* SaveRunAction is now applicable */}
  </ModelScopeFactory>
</ActionsRegistryProvider>;
```

`ActionsManager.fromExisting(context)` builds a throwaway manager holding the
same actions and models — this is how a shortcut or window event evaluates
`applicable()` against a fresh copy of the current scope.

## Development

```bash
bun install       # from the workspace root
bun run test:run
bun run typecheck
```
