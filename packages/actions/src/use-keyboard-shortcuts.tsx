import { useEffect } from 'react';

/**
 * Type definitions for the keyboard shortcut hook
 */
export type KeyName = string;

interface ShortcutConfig {
  shortcut: KeyName[];
  available?: () => boolean;
  callback: (event: KeyboardEvent) => Promise<void> | void;
}

const MODIFIER_KEYS: ReadonlySet<KeyName> = new Set(['ctrl', 'shift', 'alt']);

interface KeyboardShortcutOptions {
  preventDefault?: boolean;
  stopPropagation?: boolean;
}

/**
 * Hook for registering multiple keyboard shortcuts
 * @param shortcuts - Array of shortcut objects with key combinations and callbacks
 * @param options - Additional options for event handling
 */
export const useKeyboardShortcuts = (
  shortcuts: ShortcutConfig[],
  options: KeyboardShortcutOptions = {}
): void => {
  const { preventDefault = true, stopPropagation = false } = options;

  useEffect(() => {
    // Keep track of currently pressed keys
    const pressedKeys = new Set<KeyName>();

    // Handle keydown event
    const handleKeyDown = async (event: KeyboardEvent): Promise<void> => {
      // Add the key to the set of pressed keys
      // Handle special keys with consistent naming
      const key = event.key?.toLowerCase() ?? '';

      // Standardize key names for modifier keys
      let normalizedKey: KeyName = key;
      if (key === 'control' || key === 'meta') {
        normalizedKey = 'ctrl';
      }
      if (key === ' ') {
        normalizedKey = 'space';
      }
      if (key === 'escape') {
        normalizedKey = 'esc';
      }
      if (key === 'arrowup') {
        normalizedKey = 'up';
      }
      if (key === 'arrowdown') {
        normalizedKey = 'down';
      }
      if (key === 'arrowleft') {
        normalizedKey = 'left';
      }
      if (key === 'arrowright') {
        normalizedKey = 'right';
      }

      // Only ever one non-modifier at a time. macOS withholds keyup for other
      // keys while Command is held, so the `c` of a Cmd-C is still "pressed"
      // when the Cmd-V after it arrives — and the exact-match check below would
      // read that as a three-key chord and fire neither.
      for (const pressed of pressedKeys) {
        if (MODIFIER_KEYS.has(pressed) === false) {
          pressedKeys.delete(pressed);
        }
      }
      pressedKeys.add(normalizedKey);

      // Add modifier keys directly
      if (event.ctrlKey) {
        pressedKeys.add('ctrl');
      }
      if (event.shiftKey) {
        pressedKeys.add('shift');
      }
      if (event.altKey) {
        pressedKeys.add('alt');
      }
      if (event.metaKey) {
        pressedKeys.add('ctrl');
      }

      // Check each shortcut to see if it matches
      for (const { shortcut, callback } of shortcuts.filter(
        (s) => s.available?.() ?? true
      )) {
        // Convert all keys to lowercase for case-insensitive matching
        const keys = shortcut.map((k) => k.toLowerCase());

        // Check if all required keys are pressed and the count matches
        // This ensures exact matches (e.g., ['ctrl', 'a'] won't trigger if ctrl+shift+a is pressed)
        const allKeysPressed = keys.every((k) => pressedKeys.has(k));
        const exactMatch = pressedKeys.size === keys.length;

        if (allKeysPressed && exactMatch) {
          if (preventDefault) {
            event.preventDefault();
          }
          if (stopPropagation) {
            event.stopPropagation();
          }
          await callback(event);
        }
      }
    };

    // Handle keyup event
    const handleKeyUp = (event: KeyboardEvent): void => {
      // Remove the key from the set of pressed keys
      const key = event.key?.toLowerCase() ?? '';

      // Standardize key names for modifier keys to match keydown
      let normalizedKey: KeyName = key;
      if (key === 'control' || key === 'meta') {
        normalizedKey = 'ctrl';
      }
      if (key === ' ') {
        normalizedKey = 'space';
      }
      if (key === 'escape') {
        normalizedKey = 'esc';
      }
      if (key === 'arrowup') {
        normalizedKey = 'up';
      }
      if (key === 'arrowdown') {
        normalizedKey = 'down';
      }
      if (key === 'arrowleft') {
        normalizedKey = 'left';
      }
      if (key === 'arrowright') {
        normalizedKey = 'right';
      }

      pressedKeys.delete(normalizedKey);

      // Clear modifier keys when released
      if (!event.ctrlKey) {
        pressedKeys.delete('ctrl');
      }
      if (!event.shiftKey) {
        pressedKeys.delete('shift');
      }
      if (!event.altKey) {
        pressedKeys.delete('alt');
      }
      if (!event.metaKey) {
        pressedKeys.clear();
      }
    };

    // Add event listeners
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Clean up event listeners on unmount
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [shortcuts, preventDefault, stopPropagation]);
};
