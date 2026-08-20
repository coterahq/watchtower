import { useEffect } from 'react';

/**
 * Type definitions for the window events hook
 */
export type EventName = string;

// Common window event types
export type WindowEventType =
  | 'resize'
  | 'scroll'
  | 'beforeunload'
  | 'unload'
  | 'load'
  | 'focus'
  | 'blur'
  | 'online'
  | 'offline'
  | 'storage'
  | 'message'
  | 'error'
  | string; // Allow custom events

interface WindowEventOptions {
  preventDefault?: boolean;
  stopPropagation?: boolean;
  capture?: boolean;
}

/**
 * Hook for registering custom events with data
 *
 * @example
 * ```tsx
 * useCustomWindowEvents([
 *   {
 *     event: 'custom-action',
 *     callback: (event) => {
 *       console.log('Custom action:', event.detail);
 *     }
 *   }
 * ]);
 *
 * // Dispatch custom event
 * window.dispatchEvent(new CustomEvent('custom-action', {
 *   detail: { action: 'save' }
 * }));
 * ```
 *
 * @param events - Array of custom event objects
 * @param options - Additional options for event handling
 */
export const useCustomWindowEvents = (
  events: Array<{
    event: string;
    available?: () => boolean;
    callback: (event: CustomEvent) => Promise<void> | void;
  }>,
  options: WindowEventOptions = {}
): void => {
  const {
    preventDefault = false,
    stopPropagation = false,
    capture = false,
  } = options;

  useEffect(() => {
    // Handle custom event function
    const handleEvent = async (event: Event): Promise<void> => {
      // Find matching event config
      const eventConfigs = events.filter(
        (e) => e.event === event.type && (e.available?.() ?? true)
      );

      for (const eventConfig of eventConfigs) {
        if (event instanceof CustomEvent) {
          if (preventDefault) {
            event.preventDefault();
          }
          if (stopPropagation) {
            event.stopPropagation();
          }
          await eventConfig.callback(event);
        }
      }
    };

    const eventTypes = new Set(events.map(({ event }) => event));

    // Add event listeners for all events
    eventTypes.forEach((eventType) => {
      window.addEventListener(eventType, handleEvent, capture);
    });

    // Clean up event listeners on unmount
    return () => {
      eventTypes.forEach((eventType) => {
        window.removeEventListener(eventType, handleEvent, capture);
      });
    };
  }, [events, preventDefault, stopPropagation, capture]);
};
