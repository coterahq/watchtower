# WatchTower

Observable values, viewmodels, and context-aware actions for React.

## Why this exists

[Jotai](https://jotai.org) is good. Atoms are fine-grained and fast, and a
component re-renders for exactly the state it read. We did not want to replace
that — every watchable in here *is* a jotai atom underneath.

What jotai leaves to you are the two things that turned out to be the whole
problem in a large app:

**Where does an atom live, and how do I get to it?** A module-level atom is
global; an atom in context is manual plumbing. Neither answers "the run this
part of the screen is about." So we defined scoping: viewmodels are registered
into a scope attached to a component subtree, and looked up *by type*. A
component asks for "the run" and gets the one in scope, rather than being handed
one down through props. That is the **models** layer, and **actions** is what
falls out of it — an operation that reads what is in scope can declare when it
applies, so the same action serves a command palette, a shortcut, and a button.

**How does an atom get connected to the outside world?** Most interesting state
is not owned by the app. It is a URL parameter, an SSE or WebSocket frame, a
query cache entry, a value in localStorage. Wiring each of those up by hand is
where the bugs live: stale responses landing out of order, a poll that never
stops after the socket reconnects, an optimistic write with no rollback. That is
the **watchables** layer — one variant per kind of outside world, with the
failure modes already handled.

## The packages

A bun workspace, layered so you take only what you need:

| Package                                              | What it is                                                              | Depends on                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------ |
| [`@cotera/watchtower`](packages/watchtower)          | Watchables: derivation, polling, persistence, per-key records            | react, jotai                                     |
| [`@cotera/watchtower-events`](packages/events)       | Event bus, event-driven refresh, fallback polling, optimistic writes     | `watchtower`, react, jotai                       |
| [`@cotera/watchtower-models`](packages/models)       | Viewmodels: model scopes, lookup by type, targeting                      | react                                            |
| [`@cotera/watchtower-actions`](packages/actions)     | Actions: applicability, shortcuts, window events, tracking               | `-models`, react, zod, neverthrow                |
| [`@cotera/watchtower-query`](packages/query)         | TanStack Query bindings for watchables                                   | `watchtower`, `-events`, jotai, @tanstack/react-query |

```
watchtower ←── watchtower-events ←── watchtower-query
       ↖________________________________/

watchtower-models ←── watchtower-actions
```

The two roots are independent of each other: models hold watchables by
convention, not by dependency, so either half can be adopted on its own. Actions
is the only package that requires another, because an action's whole premise is
reading what is in scope.

`-events` is split out for the same reason `-query` is: an app with no push
stream should not carry an event bus, and the core has no idea either exists.

## The idea

- **Watchables** — a value you can read synchronously, subscribe to, and derive
  from. Variants connect it to the outside: polling, event-driven refresh,
  optimistic writes, or persistence.
- **Models** — viewmodels registered into a scope and found by *type*, so a
  component asks for "the run" rather than being handed one through props.
- **Actions** — operations that declare when they apply and read the models in
  scope, so the same action serves a command palette, a shortcut, and a button.

```tsx
import { Watchable, useWatchableValue } from '@cotera/watchtower';

const firstName = Watchable.fromValue('Ada');
const fullName = Watchable.from((get) => `${get(firstName)} Lovelace`);

function Greeting() {
  return <h1>Hello {useWatchableValue(fullName)}</h1>;
}
```

Each package documents itself: **[watchtower](packages/watchtower)**,
**[events](packages/events)**, **[models](packages/models)**,
**[actions](packages/actions)**, **[query](packages/query)**.

## Using it with Claude

The repo ships a [Claude Code](https://claude.com/claude-code) skill that teaches
an agent the API surface and the failure modes it is built around, so it reaches
for the right layer instead of reinventing one:

```
/plugin marketplace add coterahq/watchtower
/plugin install watchtower
```

The skill loads on demand — when a task actually touches a `@cotera/watchtower*`
package — and routes to a reference file per layer. Contributors working in this
repo get it automatically through `.claude/skills`. Source lives in
[`skills/watchtower`](skills/watchtower).

## Development

```bash
bun install
bun run test        # vitest across every package, watch
bun run test:run    # vitest across every package, once
bun run typecheck   # tsc in each package
```

Every package ships TypeScript sources — no build step, no `dist`. Bun and Vite
consume them directly; under Next.js add them to `transpilePackages`.

`react` and `jotai` are peer dependencies, so your app owns the version and the
tree holds exactly one copy of each — which matters, because a watchable's value
lives in a single module-level jotai store.

## Origin

Extracted from the Cotera web client, where it backs roughly 200 modules. The
model/action/scope split takes its inspiration from published descriptions of
Linear's internal React architecture.
