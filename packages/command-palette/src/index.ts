/**
 * WatchTower command palette — headless.
 *
 * The palette is the surface where the two halves of an app meet: the actions
 * registered right now, filtered to the ones that apply, and the resources the
 * viewmodels in scope say they can navigate to. Both are already declared —
 * this package only searches, groups, orders and selects them.
 *
 * It renders nothing. `useCommandPalette` hands back rows and the props to draw
 * them with, so the look belongs to your design system and the behaviour — the
 * ranking, the wrap-around, the `next: true` action that must not close the
 * dialog over its own follow-up — does not have to be written twice.
 */
export { useCommandPalette } from './use-command-palette';
export {
  useCommandPaletteTrigger,
  type CommandPaletteTrigger,
  type CommandPaletteTriggerOptions,
} from './use-command-palette-trigger';
export { defaultMatcher, fuzzyScore } from './match';
export {
  type CommandPalette,
  type CommandPaletteOptions,
  type CommandPaletteEntry,
  type CommandPaletteEntryBase,
  type CommandPaletteActionEntry,
  type CommandPaletteResourceEntry,
  type CommandPaletteSection,
  type CommandPaletteLayout,
  type CommandPaletteCloseReason,
  type CommandPaletteCandidate,
  type CommandPaletteMatcher,
  type CommandPaletteItemProps,
  type CommandPaletteListProps,
} from './types';
