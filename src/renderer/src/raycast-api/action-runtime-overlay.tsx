/**
 * Action runtime overlay and extraction layer.
 *
 * Provides static fallback extraction from ActionPanel trees and the
 * command palette style action overlay renderer.
 *
 * Internal sub-components:
 *  - ActionMenuItem  — single action row, shared by top-level and submenu views
 *  - ActionMenuList  — grouped list renderer, delegates to ActionMenuItem
 *
 * ActionPanelOverlay is a presentational component: the parent controls
 * visibility via conditional rendering and passes the action list as a prop.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { ExtractedAction, ActionShortcut } from './action-runtime-types';
import { resolveIconSrc } from './icon-runtime-assets';

interface OverlayDeps {
  snapshotExtensionContext: () => any;
  inferActionTitle: (props: any, kind?: string) => string;
  makeActionExecutor: (props: any, runtimeCtx?: any) => () => void;
  renderIcon: (icon: any, className?: string, assetsPath?: string) => React.ReactNode;
  matchesShortcut: (e: React.KeyboardEvent | KeyboardEvent, shortcut?: ActionShortcut) => boolean;
  isMetaK: (e: React.KeyboardEvent | KeyboardEvent) => boolean;
  renderShortcut: (shortcut?: ActionShortcut) => React.ReactNode;
  renderShortcutKeycap: (label: string, key?: React.Key) => React.ReactNode;
}

export function createActionOverlayRuntime(deps: OverlayDeps) {
  const {
    snapshotExtensionContext,
    inferActionTitle,
    makeActionExecutor,
    renderIcon,
    matchesShortcut,
    isMetaK,
    renderShortcut,
    renderShortcutKeycap,
  } = deps;

  let sectionIdCounter = 0;

  // ---------------------------------------------------------------------------
  // Static extraction (unchanged)
  // ---------------------------------------------------------------------------

  function extractActionsFromElement(element: React.ReactElement | undefined | null): ExtractedAction[] {
    if (!element) return [];

    const result: ExtractedAction[] = [];
    const runtimeCtx = snapshotExtensionContext();

    function walk(nodes: React.ReactNode, section?: { id: string; title?: string }) {
      React.Children.forEach(nodes, (child) => {
        if (!React.isValidElement(child)) return;

        const props = child.props as any;
        const hasChildren = props.children != null;
        const isActionLike =
          props.onAction || props.onSubmit || props.content !== undefined || props.url || props.target || props.paths;

        if (isActionLike || (props.title && !hasChildren)) {
          result.push({
            title: inferActionTitle(props),
            icon: props.icon,
            shortcut: props.shortcut,
            style: props.style,
            section,
            execute: makeActionExecutor(props, runtimeCtx),
          });
          return;
        }

        if (child.type && (child.type as any).__isSubmenu) {
          result.push({
            title: props.title,
            icon: props.icon,
            shortcut: props.shortcut,
            execute: () => {},
            submenu: extractActionsFromElement(child),
          });
          return;
        }

        if (hasChildren) {
          walk(props.children, props.title ? { id: `__section_${++sectionIdCounter}`, title: props.title } : section);
        }
      });
    }

    const rootProps = element.props as any;
    if (rootProps?.children) {
      walk(rootProps.children);
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Shared icon helpers
  // ---------------------------------------------------------------------------

  const hasImageExtension = (value: string): boolean => /\.(svg|png|jpe?g|gif|webp|ico|tiff?)$/i.test(value);

  function hasRenderableActionIcon(icon: ExtractedAction['icon'], assetsPath: string): boolean {
    if (!icon) return false;
    if (typeof icon === 'string') {
      return hasImageExtension(icon) ? Boolean(resolveIconSrc(icon, assetsPath)) : true;
    }
    if (typeof icon !== 'object') return true;

    const source = (icon as Record<string, unknown>).source;
    const fallback = (icon as Record<string, unknown>).fallback;
    const fileIcon = (icon as Record<string, unknown>).fileIcon;
    if (typeof fileIcon === 'string' && fileIcon.trim()) return true;

    if (typeof source === 'string') {
      return hasImageExtension(source) ? Boolean(resolveIconSrc(source, assetsPath)) : true;
    }

    if (source && typeof source === 'object') {
      const variants = [(source as any).light, (source as any).dark].filter(
        (v): v is string => typeof v === 'string' && v.trim().length > 0,
      );
      if (variants.length > 0) {
        const assetLike = variants.filter(hasImageExtension);
        if (assetLike.length === 0) return true;
        if (assetLike.some((v) => Boolean(resolveIconSrc(v, assetsPath)))) return true;
      }
    }

    if (typeof fallback === 'string' && fallback.trim()) return true;
    return false;
  }

  // ---------------------------------------------------------------------------
  // Submenu stack type
  // ---------------------------------------------------------------------------

  type SubmenuFrame = { parentTitle: string; actions: ExtractedAction[] };

  // ---------------------------------------------------------------------------
  // ActionMenuItem — single action row
  // Renders identically for top-level and submenu items.
  // ---------------------------------------------------------------------------

  function ActionMenuItem({
    action,
    idx,
    selected,
    hasAnyIcons,
    isFirst,
    isNativeLiquidGlass,
    assetsPath,
    onSelect,
    onHover,
  }: {
    action: ExtractedAction;
    idx: number;
    selected: boolean;
    hasAnyIcons: boolean;
    isFirst: boolean;
    isNativeLiquidGlass: boolean;
    assetsPath: string;
    onSelect: (action: ExtractedAction) => void;
    onHover: (idx: number) => void;
  }) {
    const hasActionIcon = hasRenderableActionIcon(action.icon, assetsPath);
    const isDestructive = action.style === 'destructive';
    const hasSubmenu = Boolean(action.submenu && action.submenu.length > 0);

    return (
      <div
        data-action-idx={idx}
        className={`mx-1 px-2.5 py-1.5 rounded-lg border border-transparent flex items-center gap-2.5 cursor-pointer transition-colors ${
          selected ? 'bg-[var(--action-menu-selected-bg)]' : 'hover:bg-[var(--overlay-item-hover-bg)]'
        }`}
        style={
          selected
            ? {
                background: 'var(--action-menu-selected-bg)',
                borderColor: 'var(--action-menu-selected-border)',
                boxShadow: 'var(--action-menu-selected-shadow)',
              }
            : undefined
        }
        onClick={() => onSelect(action)}
        onMouseMove={() => onHover(idx)}
      >
        {hasAnyIcons && (
          <span
            className={`w-4 h-4 flex-shrink-0 flex items-center justify-center text-xs ${
              selected ? 'text-white' : 'text-white/50'
            }`}
            style={isNativeLiquidGlass && isDestructive ? { color: 'var(--status-danger-faded)' } : undefined}
          >
            {hasActionIcon ? renderIcon(action.icon, 'w-4 h-4', assetsPath) : null}
          </span>
        )}
        <span
          className={`flex-1 text-[13px] truncate ${
            isDestructive
              ? selected
                ? 'text-white'
                : 'text-red-400'
              : selected
                ? 'text-white'
                : 'text-white/80'
          }`}
          style={isNativeLiquidGlass && isDestructive ? { color: 'var(--status-danger-faded)' } : undefined}
        >
          {action.title}
        </span>
        <span className={`flex items-center gap-0.5 ${selected ? 'text-white/70' : 'text-white/25'}`}>
          {hasSubmenu ? (
            <span className="text-[11px]">›</span>
          ) : isFirst ? (
            renderShortcutKeycap('↩', 'enter')
          ) : (
            renderShortcut(action.shortcut)
          )}
        </span>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // ActionMenuList — grouped list, shared by top-level and submenu views
  // ---------------------------------------------------------------------------

  function ActionMenuList({
    actions,
    selectedIdx,
    grouped,
    isNativeLiquidGlass,
    assetsPath,
    onSelect,
    onHover,
  }: {
    actions: ExtractedAction[];
    selectedIdx: number;
    /** When true, actions are grouped by section with titles and separators.
     *  When false (active filter query), all results render in a single flat group. */
    grouped: boolean;
    isNativeLiquidGlass: boolean;
    assetsPath: string;
    onSelect: (action: ExtractedAction) => void;
    onHover: (idx: number) => void;
  }) {
    if (actions.length === 0) {
      return <div className="px-3 py-4 text-center text-white/30 text-sm">No matching actions</div>;
    }

    const hasAnyIcons = actions.some((a) => hasRenderableActionIcon(a.icon, assetsPath));

    if (!grouped) {
      // Active filter: flat list, no section headers or separators
      return (
        <>
          {actions.map((action, idx) => (
            <ActionMenuItem
              key={idx}
              action={action}
              idx={idx}
              selected={idx === selectedIdx}
              hasAnyIcons={hasAnyIcons}
              isFirst={idx === 0}
              isNativeLiquidGlass={isNativeLiquidGlass}
              assetsPath={assetsPath}
              onSelect={onSelect}
              onHover={onHover}
            />
          ))}
        </>
      );
    }

    // No filter: group actions by section boundary
    const groups: { title?: string; items: { action: ExtractedAction; idx: number }[] }[] = [];
    let itemIdx = 0;
    let currentSectionId: string | undefined | null = null;

    for (const action of actions) {
      const sectionId = action.section?.id;
      if (sectionId !== currentSectionId || groups.length === 0) {
        currentSectionId = sectionId;
        groups.push({ title: action.section?.title, items: [] });
      }
      groups[groups.length - 1].items.push({ action, idx: itemIdx++ });
    }

    return (
      <>
        {groups.map((group, groupPos) => (
          <div key={groupPos}>
            {groupPos > 0 && <hr className="border-[var(--ui-divider)] my-1" />}
            {group.title && (
              <div className="px-3 pt-1.5 pb-1 text-[10px] tracking-wider text-[color:var(--text-subtle)] font-medium select-none">
                {group.title}
              </div>
            )}
            {group.items.map(({ action, idx }) => (
              <ActionMenuItem
                key={idx}
                action={action}
                idx={idx}
                selected={idx === selectedIdx}
                hasAnyIcons={hasAnyIcons}
                isFirst={idx === 0}
                isNativeLiquidGlass={isNativeLiquidGlass}
                assetsPath={assetsPath}
                onSelect={onSelect}
                onHover={onHover}
              />
            ))}
          </div>
        ))}
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // ActionPanelOverlay — presentational overlay controlled by parent
  //
  // The parent is responsible for:
  //  - deciding when to mount/unmount (visibility)
  //  - collecting and passing the action list
  //  - handling shortcuts while the overlay is closed
  // ---------------------------------------------------------------------------

  function ActionPanelOverlay({
    actions,
    onClose,
    onExecute,
    filterEnabled = true,
    defaultSubmenu,
  }: {
    actions: ExtractedAction[];
    onClose: () => void;
    onExecute: (action: ExtractedAction) => void;
    /** Show the search/filter input. Defaults to true. */
    filterEnabled?: boolean;
    /**
     * If provided, the overlay mounts already navigated into this action's submenu.
     * Useful when the parent detects a keyboard shortcut for a submenu action and
     * wants to open the panel pre-navigated rather than at the top level.
     * The action must have a non-empty `submenu` array.
     */
    defaultSubmenu?: ExtractedAction;
  }) {
    const [selectedIdx, setSelectedIdx] = useState(0);
    const [filter, setFilter] = useState('');
    const [submenuStack, setSubmenuStack] = useState<SubmenuFrame[]>(() =>
      defaultSubmenu?.submenu?.length
        ? [{ parentTitle: defaultSubmenu.title, actions: defaultSubmenu.submenu }]
        : [],
    );
    const filterRef = useRef<HTMLInputElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const runtimeCtx = snapshotExtensionContext();
    const assetsPath = String(runtimeCtx?.assetsPath || '').trim();

    const inSubmenu = submenuStack.length > 0;
    const currentFrame = inSubmenu ? submenuStack[submenuStack.length - 1] : null;

    // Filtering applies only at the top level; submenus always show all their items.
    const baseActions = inSubmenu ? currentFrame!.actions : actions;
    const currentActions =
      !inSubmenu && filterEnabled && filter
        ? baseActions.filter((a) => a.title.toLowerCase().includes(filter.toLowerCase()))
        : baseActions;

    // Focus the primary interactive element on mount
    useEffect(() => {
      if (filterEnabled) {
        filterRef.current?.focus();
      } else {
        panelRef.current?.focus();
      }
    }, []);

    // On submenu depth change: reset selection and manage focus
    useEffect(() => {
      setSelectedIdx(0);
      if (inSubmenu) {
        // Panel needs focus so arrow keys navigate without the filter interfering
        filterRef.current?.blur();
        panelRef.current?.focus();
      } else if (filterEnabled) {
        filterRef.current?.focus();
      } else {
        panelRef.current?.focus();
      }
    }, [submenuStack.length, filterEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

    // Reset selection when filter text changes
    useEffect(() => {
      setSelectedIdx(0);
    }, [filter]);

    // Scroll the selected item into view
    useEffect(() => {
      panelRef.current
        ?.querySelector(`[data-action-idx="${selectedIdx}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    }, [selectedIdx]);

    const pushSubmenu = (action: ExtractedAction) => {
      if (action.submenu && action.submenu.length > 0) {
        setSubmenuStack((stack) => [...stack, { parentTitle: action.title, actions: action.submenu! }]);
      }
    };

    const popSubmenu = () => {
      setSubmenuStack((stack) => stack.slice(0, -1));
    };

    const handleSelect = (action: ExtractedAction) => {
      if (action.submenu && action.submenu.length > 0) {
        pushSubmenu(action);
      } else {
        onExecute(action);
      }
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
      if (inSubmenu) {
        switch (event.key) {
          case 'Escape':
          case 'ArrowLeft':
            event.preventDefault();
            event.stopPropagation();
            popSubmenu();
            return;
          case 'ArrowDown':
            event.preventDefault();
            event.stopPropagation();
            setSelectedIdx((v) => Math.min(v + 1, currentActions.length - 1));
            return;
          case 'ArrowUp':
            event.preventDefault();
            event.stopPropagation();
            setSelectedIdx((v) => Math.max(v - 1, 0));
            return;
          case 'Enter':
            event.preventDefault();
            event.stopPropagation();
            if (!event.repeat && currentActions[selectedIdx]) {
              handleSelect(currentActions[selectedIdx]);
            }
            return;
        }
        return;
      }

      if ((event.metaKey || event.altKey || event.ctrlKey) && !event.repeat) {
        if (isMetaK(event)) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          return;
        }
        for (const action of actions) {
          if (!action.shortcut || !matchesShortcut(event, action.shortcut)) continue;
          event.preventDefault();
          event.stopPropagation();
          handleSelect(action);
          return;
        }
      }

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          event.stopPropagation();
          setSelectedIdx((v) => Math.min(v + 1, currentActions.length - 1));
          break;
        case 'ArrowUp':
          event.preventDefault();
          event.stopPropagation();
          setSelectedIdx((v) => Math.max(v - 1, 0));
          break;
        case 'ArrowRight':
          event.preventDefault();
          event.stopPropagation();
          if (!event.repeat && currentActions[selectedIdx]) {
            pushSubmenu(currentActions[selectedIdx]);
          }
          break;
        case 'Enter':
          event.preventDefault();
          event.stopPropagation();
          if (!event.repeat && currentActions[selectedIdx]) {
            handleSelect(currentActions[selectedIdx]);
          }
          break;
        case 'Escape':
          event.preventDefault();
          event.stopPropagation();
          onClose();
          break;
      }
    };

    const isGlassyTheme =
      document.documentElement.classList.contains('sc-glassy') ||
      document.body.classList.contains('sc-glassy');
    const isNativeLiquidGlass =
      document.documentElement.classList.contains('sc-native-liquid-glass') ||
      document.body.classList.contains('sc-native-liquid-glass');

    return (
      <div
        className="fixed inset-0 z-50"
        onClick={onClose}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
        style={{ background: 'var(--bg-scrim)' }}
      >
        <div
          ref={panelRef}
          tabIndex={0}
          className={`absolute bottom-12 right-3 w-80 max-h-[65vh] overflow-hidden flex flex-col ${
            isNativeLiquidGlass || isGlassyTheme ? 'rounded-3xl p-1' : 'rounded-xl shadow-2xl'
          }`}
          style={
            isNativeLiquidGlass
              ? {
                  background: 'rgba(var(--surface-base-rgb), 0.72)',
                  backdropFilter: 'blur(44px) saturate(155%)',
                  WebkitBackdropFilter: 'blur(44px) saturate(155%)',
                  border: '1px solid rgba(var(--on-surface-rgb), 0.22)',
                  boxShadow: `
                    0 18px 38px -12px rgba(var(--backdrop-rgb), 0.26),
                    inset 0 -1px 0 0 rgba(var(--on-surface-rgb), 0.05)
                  `,
                }
              : isGlassyTheme
                ? {
                    background: `
                      linear-gradient(160deg,
                        rgba(255, 255, 255, 0.16) 0%,
                        rgba(255, 255, 255, 0.035) 38%,
                        rgba(255, 255, 255, 0.07) 100%
                      ),
                      rgba(var(--surface-base-rgb), 0.58)
                    `,
                    backdropFilter: 'blur(128px) saturate(195%) contrast(107%) brightness(1.03)',
                    WebkitBackdropFilter: 'blur(128px) saturate(195%) contrast(107%) brightness(1.03)',
                    border: '1px solid rgba(255, 255, 255, 0.14)',
                    boxShadow: `
                      0 28px 58px -14px rgba(0, 0, 0, 0.42),
                      inset 0 -1px 0 0 rgba(0, 0, 0, 0.08)
                    `,
                  }
                : {
                    background: 'var(--card-bg)',
                    backdropFilter: 'blur(40px)',
                    WebkitBackdropFilter: 'blur(40px)',
                    border: '1px solid var(--border-primary)',
                  }
          }
          onClick={(e) => e.stopPropagation()}
        >
          {inSubmenu && (
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--ui-divider)]">
              <button onClick={popSubmenu} className="text-white/40 hover:text-white/80 transition-colors">
                <span className="text-[12px]">←</span>
              </button>
              <span className="text-[13px] text-white/50">{currentFrame!.parentTitle}</span>
            </div>
          )}
          <div className="action-overlay-scroll flex-1 overflow-y-auto py-1">
            <ActionMenuList
              actions={currentActions}
              selectedIdx={selectedIdx}
              grouped={!filter || inSubmenu}
              isNativeLiquidGlass={isNativeLiquidGlass}
              assetsPath={assetsPath}
              onSelect={handleSelect}
              onHover={setSelectedIdx}
            />
          </div>
          {filterEnabled && !inSubmenu && (
            <div className="border-t border-[var(--ui-divider)] mx-1 px-2.5 py-2">
              <input
                ref={filterRef}
                type="text"
                placeholder="Search for actions…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full bg-transparent text-sm text-white/70 placeholder:text-[color:var(--text-subtle)] placeholder:text-[13px] outline-none"
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return {
    extractActionsFromElement,
    ActionPanelOverlay,
  };
}
