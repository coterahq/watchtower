import { useMemo } from 'react';
import {
  useCustomWindowEvents,
  useKeyboardShortcuts,
  type KeyName,
} from '@cotera/watchtower-actions';

/** How the palette was asked to open. */
export type CommandPaletteTrigger = 'keyboard' | 'event';

export type CommandPaletteTriggerOptions = {
  onOpen: (trigger: CommandPaletteTrigger, event: Event) => void;

  /** Defaults to `['ctrl', 'k']` — Ctrl and Meta both normalise to `ctrl`. */
  shortcut?: KeyName[] | null;

  /**
   * A window event that opens the palette, for code with no view in reach:
   * `window.dispatchEvent(new CustomEvent('open-command-palette'))`.
   * Defaults to `open-command-palette`; `null` turns it off.
   */
  event?: string | null;

  /**
   * Whether the trigger is live. Pass `false` while the palette is already
   * open: the chord is then left alone rather than swallowed, so a Ctrl-K
   * bound inside the palette itself still works.
   */
  enabled?: boolean;
};

const DEFAULT_SHORTCUT: KeyName[] = ['ctrl', 'k'];
const DEFAULT_EVENT = 'open-command-palette';

/**
 * Binds the two ways a palette is normally summoned — a keyboard chord and a
 * window event — to your own open function.
 *
 * Mount it once, near the top of the app. It renders nothing and holds no
 * state; what "open" means is yours.
 *
 * ```tsx
 * useCommandPaletteTrigger({
 *   enabled: !isOpen,
 *   onOpen: (trigger) => {
 *     analytics.track('Command Palette Opened', { trigger });
 *     setOpen(true);
 *   },
 * });
 * ```
 */
export function useCommandPaletteTrigger(
  options: CommandPaletteTriggerOptions
): void {
  const {
    onOpen,
    shortcut = DEFAULT_SHORTCUT,
    event = DEFAULT_EVENT,
    enabled = true,
  } = options;

  const shortcuts = useMemo(
    () =>
      shortcut === null
        ? []
        : [
            {
              shortcut,
              // Checked before the keystroke is consumed, which is the point:
              // a disabled trigger must not eat the chord.
              available: () => enabled,
              callback: (keyEvent: KeyboardEvent) => onOpen('keyboard', keyEvent),
            },
          ],
    [shortcut, enabled, onOpen]
  );

  const events = useMemo(
    () =>
      event === null
        ? []
        : [
            {
              event,
              available: () => enabled,
              callback: (customEvent: CustomEvent) =>
                onOpen('event', customEvent),
            },
          ],
    [event, enabled, onOpen]
  );

  useKeyboardShortcuts(shortcuts);
  useCustomWindowEvents(events, { preventDefault: true });
}
