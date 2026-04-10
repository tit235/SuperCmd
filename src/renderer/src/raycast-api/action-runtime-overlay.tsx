/**
 * Action runtime overlay and extraction layer.
 *
 * Provides static fallback extraction from ActionPanel trees and the
 * command palette style action overlay renderer.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { ExtractedAction, ActionRegistration, ActionShortcut } from './action-runtime-types';
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

  function ActionPanelOverlay({
    actions,
    onClose,
    onExecute,
    visible = true,
    onShortcutOpen,
  }: {
    actions: ExtractedAction[];
    onClose: () => void;
    onExecute: (action: ExtractedAction) => void;
    visible?: boolean;
    onShortcutOpen?: () => void;
  }) {
    const [selectedIdx, setSelectedIdx] = useState(0);
    const [filter, setFilter] = useState('');
    const [submenuActions, setSubmenuActions] = useState<ExtractedAction[] | null>(null);
    const [submenuSelectedIdx, setSubmenuSelectedIdx] = useState(0);
    const filterRef = useRef<HTMLInputElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const runtimeCtx = snapshotExtensionContext();
    const assetsPath = String(runtimeCtx?.assetsPath || '').trim();

    useEffect(() => {
      if (!visible || !onShortcutOpen) return;
      
      const onWindowKeyDown = (e: KeyboardEvent) => {
        if (e.defaultPrevented) return;
        
        // Handle Escape key to close submenu from anywhere
        if (e.key === 'Escape' && submenuActions) {
          e.preventDefault();
          e.stopPropagation();
          setSubmenuActions(null);
          return;
        }
      };

      window.addEventListener('keydown', onWindowKeyDown, true);
      return () => window.removeEventListener('keydown', onWindowKeyDown, true);
    }, [visible, submenuActions, onShortcutOpen]);

    useEffect(() => {
      if (visible || !onShortcutOpen) return;

      const onWindowShortcutListener = (e: KeyboardEvent) => {
        if (e.defaultPrevented) return;
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

        for (const action of actions) {
          if (action.shortcut && matchesShortcut(e, action.shortcut)) {
            e.preventDefault();
            e.stopPropagation();
            if (action.submenu && action.submenu.length > 0) {
              setSubmenuActions(action.submenu);
              setSubmenuSelectedIdx(0);
              onShortcutOpen();
            } else {
              void (async () => {
                await Promise.resolve(action.execute());
              })();
            }
            return;
          }
        }
      };

      window.addEventListener('keydown', onWindowShortcutListener, true);
      return () => window.removeEventListener('keydown', onWindowShortcutListener, true);
    }, [actions, visible, onShortcutOpen]);

    const filteredActions = filter
      ? actions.filter((action) => action.title.toLowerCase().includes(filter.toLowerCase()))
      : actions;

    const openSubmenu = (action: ExtractedAction) => {
      if (action.submenu && action.submenu.length > 0) {
        setSubmenuActions(action.submenu);
        setSubmenuSelectedIdx(0);
      }
    };

    const executeAction = (action: ExtractedAction) => {
      if (action.submenu && action.submenu.length > 0) {
        openSubmenu(action);
      } else {
        onExecute(action);
      }
    };

    const hasImageExtension = (value: string): boolean => /\.(svg|png|jpe?g|gif|webp|ico|tiff?)$/i.test(value);

    const hasRenderableActionIcon = (icon: ExtractedAction['icon']): boolean => {
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
        const variants = [(source as any).light, (source as any).dark].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
        if (variants.length > 0) {
          const assetLikeVariants = variants.filter((value) => hasImageExtension(value));
          if (assetLikeVariants.length === 0) return true;
          if (assetLikeVariants.some((value) => Boolean(resolveIconSrc(value, assetsPath)))) return true;
        }
      }

      if (typeof fallback === 'string' && fallback.trim()) return true;
      return false;
    };

    const hasAnyIcons = filteredActions.some((action) => hasRenderableActionIcon(action.icon));

    useEffect(() => {
      filterRef.current?.focus();
    }, []);

    useEffect(() => {
      setSelectedIdx(0);
    }, [filter]);

    useEffect(() => {
      // Manage focus when submenu state changes
      if (submenuActions) {
        // When submenu opens, blur filter and focus panel for proper keyboard handling
        filterRef.current?.blur();
        panelRef.current?.focus();
      } else {
        // When submenu closes, restore focus to filter
        filterRef.current?.focus();
      }
    }, [submenuActions]);

    useEffect(() => {
      if (submenuActions) {
        panelRef.current
          ?.querySelector(`[data-submenu-action-idx="${submenuSelectedIdx}"]`)
          ?.scrollIntoView({ block: 'nearest' });
      } else {
        panelRef.current
          ?.querySelector(`[data-action-idx="${selectedIdx}"]`)
          ?.scrollIntoView({ block: 'nearest' });
      }
    }, [selectedIdx, submenuSelectedIdx, submenuActions]);

    const handleKeyDown = (event: React.KeyboardEvent) => {
      if (submenuActions) {
        if (event.key === 'Escape' || event.key === 'ArrowLeft') {
          event.preventDefault();
          event.stopPropagation();
          setSubmenuActions(null);
          return;
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          event.stopPropagation();
          setSubmenuSelectedIdx((value) => Math.min(value + 1, submenuActions.length - 1));
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          event.stopPropagation();
          setSubmenuSelectedIdx((value) => Math.max(value - 1, 0));
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          if (!event.repeat && submenuActions[submenuSelectedIdx]) {
            onExecute(submenuActions[submenuSelectedIdx]);
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
          executeAction(action);
          return;
        }
      }

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          event.stopPropagation();
          setSelectedIdx((value) => Math.min(value + 1, filteredActions.length - 1));
          break;
        case 'ArrowUp':
          event.preventDefault();
          event.stopPropagation();
          setSelectedIdx((value) => Math.max(value - 1, 0));
          break;
        case 'ArrowRight':
          event.preventDefault();
          event.stopPropagation();
          if (!event.repeat && filteredActions[selectedIdx]) {
            openSubmenu(filteredActions[selectedIdx]);
          }
          break;
        case 'Enter':
          event.preventDefault();
          event.stopPropagation();
          if (!event.repeat && filteredActions[selectedIdx]) {
            executeAction(filteredActions[selectedIdx]);
          }
          break;
        case 'Escape':
          event.preventDefault();
          event.stopPropagation();
          onClose();
          break;
      }
    };

    const groups: { title?: string; items: { action: ExtractedAction; idx: number }[] }[] = [];
    let groupIndex = 0;
    let currentSectionId: string | undefined | null = null;

    for (const action of filteredActions) {
      const sectionId = action.section?.id;
      if (sectionId !== currentSectionId || groups.length === 0) {
        currentSectionId = sectionId;
        groups.push({ title: action.section?.title, items: [] });
      }
      groups[groups.length - 1].items.push({ action, idx: groupIndex++ });
    }

    const isGlassyTheme =
      document.documentElement.classList.contains('sc-glassy') ||
      document.body.classList.contains('sc-glassy');
    const isNativeLiquidGlass =
      document.documentElement.classList.contains('sc-native-liquid-glass') ||
      document.body.classList.contains('sc-native-liquid-glass');

    if (!visible) return null;

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
            (isNativeLiquidGlass || isGlassyTheme) ? 'rounded-3xl p-1' : 'rounded-xl shadow-2xl'
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
          onClick={(event) => event.stopPropagation()}
        >
          {submenuActions ? (
            <>
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--ui-divider)]">
                <button
                  onClick={() => {
                    setSubmenuActions(null);
                    filterRef.current?.focus();
                  }}
                  className="text-white/40 hover:text-white/80 transition-colors"
                >
                  <span className="text-[12px]">←</span>
                </button>
                <span className="text-[13px] text-white/50">{filteredActions[selectedIdx]?.title}</span>
              </div>
              <div className="action-overlay-scroll flex-1 overflow-y-auto py-1">
                {submenuActions.map((action, idx) => {
                  const hasActionIcon = hasRenderableActionIcon(action.icon);
                  return (
                    <div
                      key={idx}
                      data-submenu-action-idx={idx}
                      className={`mx-1 px-2.5 py-1.5 rounded-lg border border-transparent flex items-center gap-2.5 cursor-pointer transition-colors ${
                        idx === submenuSelectedIdx
                          ? 'bg-[var(--action-menu-selected-bg)]'
                          : 'hover:bg-[var(--overlay-item-hover-bg)]'
                      }`}
                      style={
                        idx === submenuSelectedIdx
                          ? {
                              background: 'var(--action-menu-selected-bg)',
                              borderColor: 'var(--action-menu-selected-border)',
                              boxShadow: 'var(--action-menu-selected-shadow)',
                            }
                          : undefined
                      }
                      onClick={() => executeAction(action)}
                      onMouseMove={() => setSubmenuSelectedIdx(idx)}
                    >
                      {hasAnyIcons ? (
                        <span
                          className={`w-4 h-4 flex-shrink-0 flex items-center justify-center text-xs ${
                            idx === submenuSelectedIdx ? 'text-white' : 'text-white/50'
                          }`}
                          style={
                            isNativeLiquidGlass && action.style === 'destructive'
                              ? { color: 'var(--status-danger-faded)' }
                              : undefined
                          }
                        >
                          {hasActionIcon ? renderIcon(action.icon, 'w-4 h-4', assetsPath) : null}
                        </span>
                      ) : null}
                      <span
                        className={`flex-1 text-[13px] truncate ${
                          action.style === 'destructive'
                            ? idx === submenuSelectedIdx
                              ? 'text-white'
                              : 'text-red-400'
                            : idx === submenuSelectedIdx
                              ? 'text-white'
                              : 'text-white/80'
                        }`}
                        style={
                          isNativeLiquidGlass && action.style === 'destructive'
                            ? { color: 'var(--status-danger-faded)' }
                            : undefined
                        }
                      >
                        {action.title}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="action-overlay-scroll flex-1 overflow-y-auto py-1">
                {filteredActions.length === 0 ? (
              <div className="px-3 py-4 text-center text-white/30 text-sm">No matching actions</div>
            ) : (
              groups.map((group, groupPosition) => (
                <div key={groupPosition}>
                  {groupPosition > 0 && <hr className="border-[var(--ui-divider)] my-1" />}
                  {group.title && (
                    <div className="px-3 pt-1.5 pb-1 text-[10px] tracking-wider text-[color:var(--text-subtle)] font-medium select-none">
                      {group.title}
                    </div>
                  )}
                  {group.items.map(({ action, idx }) => {
                    const hasActionIcon = hasRenderableActionIcon(action.icon);
                    return (
                    <div
                      key={idx}
                      data-action-idx={idx}
                      className={`mx-1 px-2.5 py-1.5 rounded-lg border border-transparent flex items-center gap-2.5 cursor-pointer transition-colors ${
                        idx === selectedIdx
                          ? 'bg-[var(--action-menu-selected-bg)]'
                          : 'hover:bg-[var(--overlay-item-hover-bg)]'
                      }`}
                      style={
                        idx === selectedIdx
                          ? {
                              background: 'var(--action-menu-selected-bg)',
                              borderColor: 'var(--action-menu-selected-border)',
                              boxShadow: 'var(--action-menu-selected-shadow)',
                            }
                          : undefined
                      }
                      onClick={() => executeAction(action)}
                      onMouseMove={() => setSelectedIdx(idx)}
                    >
                      {hasAnyIcons ? (
                        <span
                          className={`w-4 h-4 flex-shrink-0 flex items-center justify-center text-xs ${
                            idx === selectedIdx ? 'text-white' : 'text-white/50'
                          }`}
                          style={
                            isNativeLiquidGlass && action.style === 'destructive'
                              ? { color: 'var(--status-danger-faded)' }
                              : undefined
                          }
                        >
                          {hasActionIcon ? renderIcon(action.icon, 'w-4 h-4', assetsPath) : null}
                        </span>
                      ) : null}
                      <span
                        className={`flex-1 text-[13px] truncate ${
                          action.style === 'destructive'
                            ? idx === selectedIdx
                              ? 'text-white'
                              : 'text-red-400'
                            : idx === selectedIdx
                              ? 'text-white'
                              : 'text-white/80'
                        }`}
                        style={
                          isNativeLiquidGlass && action.style === 'destructive'
                            ? { color: 'var(--status-danger-faded)' }
                            : undefined
                        }
                      >
                        {action.title}
                      </span>
                      <span className={`flex items-center gap-0.5 ${idx === selectedIdx ? 'text-white/70' : 'text-white/25'}`}>
                        {idx === 0 ? (
                          renderShortcutKeycap('↩', 'enter')
                        ) : (
                          renderShortcut(action.shortcut)
                        )}
                      </span>
                    </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
          <div className="border-t border-[var(--ui-divider)] mx-1 px-2.5 py-2">
            <input
              ref={filterRef}
              type="text"
              placeholder="Search for actions…"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="w-full bg-transparent text-sm text-white/70 placeholder:text-[color:var(--text-subtle)] placeholder:text-[13px] outline-none"
            />
          </div>
          </>
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
