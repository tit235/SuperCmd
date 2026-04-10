/**
 * raycast-api/hooks/use-shortcuts.ts
 *
 * Centralized keyboard shortcut hook.
 *
 * Accepts a declarative list of ShortcutCommand objects and installs a single
 * window-level keydown listener (capture phase) that matches events against the
 * command list in priority order and invokes the corresponding handler.
 *
 * Design choices:
 *  - Stable ref pattern: the command list is stored in a ref so the listener is
 *    never re-attached on re-renders.  Commands are sorted once per sync and
 *    re-sorted whenever the list changes.
 *  - No external dependencies beyond React — reuses matchesShortcut() from the
 *    existing action-runtime-shortcuts module.
 *  - Priority prevents conflicts: higher number = checked first.
 *    Recommended values: overlay 20, container 0, app-global -10.
 */

import { useEffect, useRef } from 'react';
import type { ActionShortcut } from '../action-runtime-types';
import { matchesShortcut } from '../action-runtime-shortcuts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShortcutCommand {
  /** Stable identifier used for deduplication / debugging. */
  id: string;

  /**
   * Raycast-style shortcut object ({ modifiers, key }).
   * Use `modifiers: []` for plain keys with no modifiers (e.g. Enter, Escape, ArrowDown).
   */
  shortcut?: ActionShortcut;

  /** Called when the event matches.  Return value is ignored. */
  handler: (event: KeyboardEvent) => void;

  /**
   * Sorting priority — higher number is checked first.
   * Default: 0.
   */
  priority?: number;

  /**
   * Whether this command is active.  Inactive commands are skipped.
   * Default: true.
   */
  enabled?: boolean;

  /**
   * Whether to call event.preventDefault() on a match.
   * Default: true.
   */
  preventDefault?: boolean;

  /**
   * Whether to call event.stopPropagation() on a match.
   * Default: true.
   */
  stopPropagation?: boolean;

  /**
   * Whether to fire the handler when event.repeat is true (key held down).
   * Default: false.
   */
  allowRepeat?: boolean;

  /**
   * Runtime guard evaluated at event time.  The command is skipped when this
   * returns false.
   */
  when?: () => boolean;
}

export interface UseShortcutsOptions {
  /** Master switch.  When false, the listener is not attached. Default: true. */
  enabled?: boolean;

  /** Use event capture phase.  Default: true. */
  capture?: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useShortcuts(
  commands: ShortcutCommand[],
  options: UseShortcutsOptions = {},
): void {
  const { enabled = true, capture = true } = options;

  // Keep a sorted ref of commands so the listener always sees fresh values
  // without needing to be re-attached.
  const commandsRef = useRef<ShortcutCommand[]>([]);

  // Sync and sort on every render where commands/enabled change.
  useEffect(() => {
    if (!enabled) {
      commandsRef.current = [];
      return;
    }
    commandsRef.current = [...commands].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    );
  });

  useEffect(() => {
    if (!enabled) return;

    const handler = (event: KeyboardEvent) => {
      for (const cmd of commandsRef.current) {
        if (cmd.enabled === false) continue;
        if (!cmd.allowRepeat && event.repeat) continue;
        if (cmd.when && !cmd.when()) continue;

        const matched = matchesShortcut(event, cmd.shortcut);

        if (!matched) continue;

        if (cmd.preventDefault !== false) event.preventDefault();
        if (cmd.stopPropagation !== false) event.stopPropagation();
        cmd.handler(event);
        return; // Only one command fires per event
      }
    };

    window.addEventListener('keydown', handler, capture);
    return () => window.removeEventListener('keydown', handler, capture);
    // capture and enabled are the only values that should trigger listener
    // re-attachment; command changes are handled via the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, capture]);
}

// ---------------------------------------------------------------------------
// Utility: build ShortcutCommand[] from an ExtractedAction array
// ---------------------------------------------------------------------------

/**
 * Converts a list of collected actions into ShortcutCommand objects.
 *
 * - The first action is mapped to both Enter (plain, no modifiers) and
 *   Meta+Enter so it fires as the primary confirmation shortcut.
 * - Every action with an explicit `shortcut` gets a modifier-keyed command.
 *
 * This bridges the existing action registry with useShortcuts / useContainerShortcuts
 * without requiring any changes to how extensions define actions.
 */
export function buildCommandsFromActions(
  actions: Array<{ title: string; shortcut?: ActionShortcut; execute: () => void }>,
  opts: {
    /** Called before executing any action (e.g. close the action panel). */
    beforeExecute?: () => void;
    /** Called after executing any action (e.g. refocus the search input). */
    afterExecute?: () => void;
    /** Base priority for action shortcut commands.  Default: 0. */
    priority?: number;
  } = {},
): ShortcutCommand[] {
  const { beforeExecute, afterExecute, priority = 0 } = opts;

  const wrap = (execute: () => void) => () => {
    beforeExecute?.();
    execute();
    if (afterExecute) setTimeout(afterExecute, 0);
  };

  const cmds: ShortcutCommand[] = [];

  actions.forEach((action, index) => {
    if (action.shortcut) {
      cmds.push({
        id: `action-shortcut-${index}`,
        shortcut: action.shortcut,
        handler: wrap(action.execute),
        priority,
      });
    }
  });

  return cmds;
}
