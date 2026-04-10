/**
 * raycast-api/hooks/use-container-shortcuts.ts
 *
 * Higher-level shortcut hook for extension container components
 * (List, Grid, Form, Detail).
 *
 * Consolidates the three concerns every container shares:
 *   1. Meta+K  — toggle the action panel overlay
 *   2. Escape  — pop the navigation stack
 *   3. Action shortcuts — modifier+key chords defined on Action components
 *
 * Callers pass additional `extraCommands` for container-specific navigation
 * (arrow keys, Enter for primary action, etc.).  Those commands run at
 * the same priority as action shortcuts so containers remain in full control.
 *
 * Usage example (List):
 *
 *   useContainerShortcuts({
 *     actions: selectedActions,
 *     toggleActionPanel: () => setShowActions((v) => !v),
 *     pop,
 *     afterActionExecute: () => setTimeout(() => inputRef.current?.focus(), 0),
 *     extraCommands: [
 *       { id: 'nav-down',  shortcut: { key: 'ArrowDown', modifiers: [] },  handler: () => setIdx(i => i + 1) },
 *       { id: 'nav-up',    shortcut: { key: 'ArrowUp',   modifiers: [] },  handler: () => setIdx(i => i - 1) },
 *       { id: 'primary',   shortcut: { key: 'Enter',     modifiers: [] },  handler: () => primaryAction?.execute() },
 *     ],
 *   });
 */

import { useMemo } from 'react';
import { buildCommandsFromActions, ShortcutCommand, useShortcuts, UseShortcutsOptions } from './use-shortcuts';
import type { ActionShortcut } from '../action-runtime-types';
import { KeyModifier } from '../action-runtime-types';

export interface UseContainerShortcutsOptions {
  /** Collected actions from useCollectedActions(). */
  actions: Array<{ title: string; shortcut?: ActionShortcut; execute: () => void }>;

  /** Toggle the action panel overlay open/closed. */
  toggleActionPanel: () => void;

  /** Pop the navigation stack. */
  pop: () => void;

  /**
   * Called before every action execution — typically used to close the panel.
   * Defaults to calling toggleActionPanel to close.
   */
  beforeActionExecute?: () => void;

  /**
   * Called after every action execution.
   * Common use: `() => setTimeout(() => inputRef.current?.focus(), 0)`
   */
  afterActionExecute?: () => void;

  /**
   * Additional container-specific commands (arrow navigation, Enter, etc.).
   * These are merged with the action-derived commands and run at priority 0.
   * When `overlayOpen` is true, all extraCommands are automatically suppressed
   * so the action overlay can handle arrow/enter navigation without conflict.
   */
  extraCommands?: ShortcutCommand[];

  /**
   * Whether the action panel overlay is currently open.
   * When true:
   *  - Escape is suppressed (the overlay handles it via its own focused handler)
   *  - All extraCommands are suppressed (overlay handles arrow/enter navigation)
   *  - Action shortcut chords still fire (and close the overlay via beforeActionExecute)
   *  - Meta+K still fires (toggles the overlay closed)
   */
  overlayOpen?: boolean;

  /** Forwarded to useShortcuts. */
  shortcutsOptions?: UseShortcutsOptions;
}

export function useContainerShortcuts(opts: UseContainerShortcutsOptions): void {
  const {
    actions,
    toggleActionPanel,
    pop,
    beforeActionExecute,
    afterActionExecute,
    extraCommands = [],
    overlayOpen = false,
    shortcutsOptions,
  } = opts;

  const beforeExecute = useMemo(
    () => beforeActionExecute ?? (() => { /* action panel is closed by caller if needed */ }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [beforeActionExecute],
  );

  const actionCommands = useMemo(
    () =>
      buildCommandsFromActions(actions, {
        beforeExecute,
        afterExecute: afterActionExecute,
        priority: 0,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actions, beforeExecute, afterActionExecute],
  );

  const builtinCommands = useMemo<ShortcutCommand[]>(
    () => [
      {
        // Meta+K always toggles the overlay regardless of open/closed state.
        id: '__meta-k',
        shortcut: { key: 'k', modifiers: [KeyModifier.Cmd] },
        handler: () => toggleActionPanel(),
        priority: 5,
      },
      {
        // Escape only pops navigation when the overlay is closed.
        // When open, the overlay's own focused onKeyDown handler calls onClose().
        id: '__escape',
        shortcut: { key: 'Escape', modifiers: [] },
        handler: () => pop(),
        priority: 5,
        when: () => !overlayOpen,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toggleActionPanel, pop, overlayOpen],
  );

  // Wrap each extraCommand so it is suppressed while the overlay is open.
  // This prevents list/grid arrow-key navigation from firing behind the overlay.
  const guardedExtraCommands = useMemo<ShortcutCommand[]>(
    () =>
      extraCommands.map((cmd) => ({
        ...cmd,
        when: cmd.when
          ? () => !overlayOpen && cmd.when!()
          : () => !overlayOpen,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [extraCommands, overlayOpen],
  );

  const allCommands = useMemo(
    () => [...builtinCommands, ...actionCommands, ...guardedExtraCommands],
    [builtinCommands, actionCommands, guardedExtraCommands],
  );

  useShortcuts(allCommands, shortcutsOptions);
}
