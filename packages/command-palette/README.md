# @cotera/watchtower-command-palette

A headless command palette for WatchTower.

The palette is where the two halves of the app meet. Every action already
declares what it is called, when it applies and what it does; every model in
scope can already say what it is navigable to. Ctrl-K is just those two lists,
searched — so it should not need a line of app code to exist, and it should not
come with someone else's design system attached.

`useCommandPalette` does the searching, grouping, ordering and selecting, and
hands you rows plus the props to draw them with. What they look like is yours.

## Install

```bash
bun add @cotera/watchtower-command-palette
bun add react zod neverthrow   # peers
```

`@cotera/watchtower-actions` (and `-models` behind it) comes along as a
dependency. The palette reads the registry those provide, so it belongs inside
an `ActionsRegistryProvider`.

## Use

```tsx
import {
  useCommandPalette,
  useCommandPaletteTrigger,
} from '@cotera/watchtower-command-palette';

function CommandPaletteTrigger() {
  const [open, setOpen] = useState(false);

  // Ctrl-K, and `window.dispatchEvent(new CustomEvent('open-command-palette'))`
  // for code with no view in reach. Disabled while open, so the chord is left
  // alone rather than swallowed.
  useCommandPaletteTrigger({ enabled: !open, onOpen: () => setOpen(true) });

  return open ? <CommandPalette onClose={() => setOpen(false)} /> : null;
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const palette = useCommandPalette({
    onNavigate: (route) => router.push(route),
    onClose,
  });

  return (
    <Dialog onClose={onClose}>
      <input
        autoFocus
        value={palette.search}
        placeholder="Search…"
        onChange={(event) => palette.setSearch(event.target.value)}
        onKeyDown={palette.onInputKeyDown}
      />

      <div {...palette.getListProps()}>
        {palette.sections.map((section) => (
          <div key={`${section.kind}:${section.group ?? ''}`}>
            {section.group !== undefined && <h3>{section.group}</h3>}
            {section.entries.map((entry) => (
              <div
                key={entry.key}
                {...palette.getItemProps(entry.index)}
                data-selected={entry.index === palette.selectedIndex}
              >
                {entry.icon && <Icon name={entry.icon} />}
                <span>{entry.title}</span>
                {entry.t === 'action' && entry.shortcut && (
                  <kbd>{entry.shortcut.join('+')}</kbd>
                )}
              </div>
            ))}
          </div>
        ))}
        {palette.isEmpty && <p>No actions or resources found</p>}
      </div>
    </Dialog>
  );
}
```

`getListProps()` carries the `ref` the palette scrolls with, so the element you
spread it onto should be the one that scrolls. Rendering the flat `entries`
array instead of `sections` is equally fine — `entry.index` is the row's
position in it either way, which is what selection and `getItemProps` are keyed
on.

## What ends up in the list

**Actions**, in registration order reversed — the most recently registered leads,
because it belongs to whatever just came on screen — minus the ones that:

- are `discrete` (or list `'discrete'` in `scopes`),
- answer false to `applicable(context)`, or
- require input and define no `ask`, so there is nothing to invoke them with.

**Resources**, from `model.resources?.()` for every model in scope. A model
declares them; the palette finds them:

```ts
class RunModel implements Model {
  resources(): ModelResource[] {
    return [
      { t: 'tab', name: 'Run logs', group: 'Run', tabRoute: `/runs/${this.id}/logs` },
      { t: 'link', name: 'Runbook', url: 'https://…' },
    ];
  }
}
```

Both are re-read when the model scope changes, so a palette left open while a
tab loads does not go stale.

Applicability is evaluated against a throwaway registry holding the current
models — the same thing the shortcut and window-event paths do — so an action
sees the scope as it is now, not as it was when the palette mounted.

## Ordering

With no query: grouped by `group` (`'Other'` when absent), rows sorted by
priority within a group, groups sorted by the priority they add up to. An
action's priority is `getPriority?.(context) ?? priority ?? 0`, so it can depend
on what is on screen; a resource's is `priority ?? 0`.

With a query: ranking is the order, and priority steps out of the way. Below
`flatSearchThreshold` characters (3 by default) the groups stay, ranked within;
at or above it the palette goes `flat` — one ranked list, actions then
resources, headings gone. `layout` tells you which you are rendering.

The default matcher is a dependency-free fuzzy scorer: characters in order, with
adjacency, word starts and whole-substring hits worth more, and descriptions
matched at half weight. Swap it for anything that ranks by index:

```ts
import Fuse from 'fuse.js';

useCommandPalette({
  matcher: (query, candidates) =>
    new Fuse(candidates, { keys: ['title', 'description'] })
      .search(query)
      .map((hit) => hit.refIndex),
});
```

## Selecting

`select(index?)` activates a row — the selected one by default. An action runs
through `askOrExecute`, so an action with an `ask` dialog opens it from here
like anywhere else. A `t: 'tab'` resource calls `onNavigate`; a `t: 'link'` one
calls `onOpenLink`, or `window.open(url, '_blank')` if you did not supply one.

`onClose(reason)` fires when the palette is done — `'action-executed'`,
`'resource-selected'` or `'escape'` — and that is your cue to close the dialog.
The exception is an action that returns `ok({ next: true })`: it has put its own
step on screen, so no close is reported and the palette stays out of the way.

`onSelect(entry)` fires just before activation, which is where analytics go:

```tsx
useCommandPalette({
  onSelect: (entry) =>
    analytics.track('Command Selected', {
      command: entry.title,
      group: entry.group,
    }),
  onClose: (reason) => {
    analytics.track('Command Palette Closed', { trigger: reason });
    setOpen(false);
  },
});
```

## Rendering somewhere else

A modal library that mounts at the document root can put the palette outside the
provider. Capture the context where the provider *is*, and hand it over:

```tsx
const context = useActionsContext();          // inside the provider
modals.open(() => <CommandPaletteView context={context} />);

// …and in the view
const palette = useCommandPalette({ context });
```

## Keyboard

`onInputKeyDown` handles arrows (wrapping at both ends), Enter and Escape for
the search field, deliberately leaving space alone — it is a character there.
`getListProps().onKeyDown` adds space-to-select for when focus is in the list
itself. Both keep the selected row scrolled into view.

## API

| Export | What it is |
| --- | --- |
| `useCommandPalette(options?)` | the palette: rows, ordering, selection, props |
| `useCommandPaletteTrigger(options)` | binds Ctrl-K and a window event to your open function |
| `defaultMatcher`, `fuzzyScore` | the default ranking, exported for reuse |

`CommandPaletteOptions`: `context`, `onNavigate`, `onOpenLink`, `onClose`,
`onSelect`, `includeAction`, `includeResource`, `flatSearchThreshold`,
`matcher`, `idPrefix`.

`CommandPalette`: `search`, `setSearch`, `entries`, `sections`, `layout`,
`isEmpty`, `selectedIndex`, `setSelectedIndex`, `moveSelection`, `select`,
`onInputKeyDown`, `getListProps`, `getItemProps`, `activeDescendantId`.
