/**
 * Clipboard Manager UI
 * 
 * Features:
 * - 40/60 split (list/preview)
 * - Actions button styled exactly like List component
 * - Matches settings window theme
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useContainerShortcuts } from './raycast-api/hooks/use-container-shortcuts';
import { Search, X, Trash2, Copy, Clipboard, Image as ImageIcon, Link, FileText, ArrowLeft, Pin, Save, FileDown } from 'lucide-react';
import type { ClipboardItem } from '../types/electron';
import ExtensionActionFooter from './components/ExtensionActionFooter';
import type { ExtractedAction, ActionShortcut } from './raycast-api/action-runtime-types';
import { KeyModifier } from './raycast-api/action-runtime-types';
import { InternalActionPanelOverlay } from './raycast-api';

interface ClipboardManagerProps {
  onClose: () => void;
}

type ClipboardStatus = {
  kind: 'success' | 'neutral';
  text: string;
};

const ClipboardManager: React.FC<ClipboardManagerProps> = ({ onClose }) => {
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<ClipboardItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filterType, setFilterType] = useState<'all' | 'text' | 'image' | 'url' | 'file'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [showActions, setShowActions] = useState(false);
  const [frontmostAppName, setFrontmostAppName] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<ClipboardStatus | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const statusTimerRef = useRef<number | null>(null);

  const focusSearchInput = useCallback(() => {
    // Defer focus to the next frame so window/show transitions don't steal it.
    window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const refreshFrontmostAppName = useCallback(async () => {
    try {
      const app = await window.electron.getLastFrontmostApp();
      setFrontmostAppName(app?.name || null);
    } catch (e) {
      console.error('Failed to load frontmost app name:', e);
    }
  }, []);

  const showStatusMessage = useCallback((status: ClipboardStatus, durationMs = 3000) => {
    setStatusMessage(status);
    if (statusTimerRef.current != null) {
      window.clearTimeout(statusTimerRef.current);
    }
    statusTimerRef.current = window.setTimeout(() => {
      setStatusMessage(null);
      statusTimerRef.current = null;
    }, durationMs);
  }, []);

  const loadHistory = useCallback(async (withLoading = false) => {
    if (withLoading) setIsLoading(true);
    try {
      const history = await window.electron.clipboardGetHistory();
      setItems((prev) => {
        if (
          prev.length === history.length &&
          prev.every((item, idx) =>
            item.id === history[idx]?.id &&
            item.timestamp === history[idx]?.timestamp &&
            Boolean(item.pinned) === Boolean(history[idx]?.pinned)
          )
        ) {
          return prev;
        }
        return history;
      });
    } catch (e) {
      console.error('Failed to load clipboard history:', e);
    }
    if (withLoading) setIsLoading(false);
  }, []);

  useEffect(() => {
    loadHistory(true);
    focusSearchInput();
    const focusTimer = window.setTimeout(() => {
      focusSearchInput();
    }, 40);
    void refreshFrontmostAppName();
    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [loadHistory, focusSearchInput, refreshFrontmostAppName]);

  useEffect(() => {
    const cleanupWindowShown = window.electron.onWindowShown(() => {
      focusSearchInput();
      void refreshFrontmostAppName();
    });
    return cleanupWindowShown;
  }, [focusSearchInput, refreshFrontmostAppName]);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current != null) {
        window.clearTimeout(statusTimerRef.current);
        statusTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadHistory(false);
    }, 750);
    return () => {
      window.clearInterval(timer);
    };
  }, [loadHistory]);

  useEffect(() => {
    let filtered = items;

    if (filterType !== 'all') {
      filtered = filtered.filter((item) => item.type === filterType);
    }

    if (searchQuery.trim()) {
      const lowerQuery = searchQuery.toLowerCase();
      filtered = filtered.filter((item) => {
        if (item.type === 'text' || item.type === 'url' || item.type === 'file') {
          return item.content.toLowerCase().includes(lowerQuery);
        }
        return false;
      });
    }

    setFilteredItems(filtered);
  }, [items, filterType, searchQuery]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filterType, searchQuery]);

  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, filteredItems.length);
  }, [filteredItems.length]);

  useEffect(() => {
    if (filteredItems.length === 0 && selectedIndex !== 0) {
      setSelectedIndex(0);
      return;
    }
    if (selectedIndex >= filteredItems.length && filteredItems.length > 0) {
      setSelectedIndex(filteredItems.length - 1);
    }
  }, [filteredItems.length, selectedIndex]);

  const scrollToSelected = useCallback(() => {
    const selectedElement = itemRefs.current[selectedIndex];
    const scrollContainer = listRef.current;

    if (selectedElement && scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect();
      const elementRect = selectedElement.getBoundingClientRect();

      if (elementRect.top < containerRect.top) {
        selectedElement.scrollIntoView({ block: 'start', behavior: 'smooth' });
      } else if (elementRect.bottom > containerRect.bottom) {
        selectedElement.scrollIntoView({ block: 'end', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  useEffect(() => {
    scrollToSelected();
  }, [selectedIndex, scrollToSelected]);



  const handlePasteItem = async (item?: ClipboardItem) => {
    const itemToPaste = item || filteredItems[selectedIndex];
    if (!itemToPaste) return;
    
    try {
      // This copies to clipboard, hides window, and simulates Cmd+V
      await window.electron.clipboardPasteItem(itemToPaste.id);
    } catch (e) {
      console.error('Failed to paste item:', e);
    }
  };

  const handleCopyToClipboard = async () => {
    if (!filteredItems[selectedIndex]) return;
    try {
      await window.electron.clipboardCopyItem(filteredItems[selectedIndex].id);
      window.electron.hideWindow();
    } catch (e) {
      console.error('Failed to copy item:', e);
    }
  };

  const handleDeleteItem = async (item?: ClipboardItem) => {
    const itemToDelete = item || filteredItems[selectedIndex];
    if (!itemToDelete) return;
    
    try {
      await window.electron.clipboardDeleteItem(itemToDelete.id);
      await loadHistory();
    } catch (e) {
      console.error('Failed to delete item:', e);
    }
  };

  const handleTogglePinItem = async (item?: ClipboardItem) => {
    const itemToPin = item || filteredItems[selectedIndex];
    if (!itemToPin) return;

    try {
      await window.electron.clipboardTogglePin(itemToPin.id);
      await loadHistory();
    } catch (e) {
      console.error('Failed to toggle pin on clipboard item:', e);
    }
  };

  const handleSaveAsSnippet = async (item?: ClipboardItem) => {
    const itemToSave = item || filteredItems[selectedIndex];
    if (!itemToSave || (itemToSave.type !== 'text' && itemToSave.type !== 'url')) return;

    try {
      const snippet = await window.electron.clipboardSaveAsSnippet(itemToSave.id);
      if (snippet) {
        showStatusMessage({ kind: 'success', text: 'Snippet saved successfully.' });
      } else {
        showStatusMessage({ kind: 'neutral', text: 'Failed to save snippet.' });
      }
    } catch (e) {
      console.error('Failed to save clipboard item as snippet:', e);
      showStatusMessage({ kind: 'neutral', text: 'Failed to save snippet.' });
    }
  };

  const handleSaveAsFile = async (item?: ClipboardItem) => {
    const itemToSave = item || filteredItems[selectedIndex];
    if (!itemToSave) return;

    try {
      await window.electron.clipboardSaveAsFile(itemToSave.id);
    } catch (e) {
      console.error('Failed to save clipboard item as file:', e);
    }
  };

  const handleClearAll = async () => {
    if (confirm('Are you sure you want to clear all clipboard history?')) {
      try {
        await window.electron.clipboardClearHistory();
        await loadHistory();
      } catch (e) {
        console.error('Failed to clear history:', e);
      }
    }
  };

  const selectedItem = filteredItems[selectedIndex];
  const canSaveAsSnippet = selectedItem?.type === 'text' || selectedItem?.type === 'url';

  const pasteLabel = frontmostAppName ? `Paste in ${frontmostAppName}` : 'Paste';

  const actions: ExtractedAction[] = [];
  actions.push({
    title: pasteLabel,
    icon: <Clipboard className="w-4 h-4" />,
    shortcut: { key: 'enter' },
    execute: () => handlePasteItem(),
  });
  actions.push({
    title: 'Copy to Clipboard',
    icon: <Copy className="w-4 h-4" />,
    shortcut: { modifiers: [KeyModifier.Cmd], key: 'enter' },
    execute: handleCopyToClipboard,
  });
  actions.push({
    title: selectedItem?.pinned ? 'Unpin Clipboard Entry' : 'Pin Clipboard Entry',
    icon: <Pin className="w-4 h-4" />,
    shortcut: { modifiers: [KeyModifier.Ctrl], key: 'p' },
    execute: handleTogglePinItem,
  });
  if (canSaveAsSnippet) {
    actions.push({
      title: 'Save as Snippet',
      icon: <Save className="w-4 h-4" />,
      shortcut: { modifiers: [KeyModifier.Ctrl], key: 's' },
      execute: handleSaveAsSnippet,
    });
  }
  actions.push({
    title: 'Save as File',
    icon: <FileDown className="w-4 h-4" />,
    shortcut: { modifiers: [KeyModifier.Ctrl, KeyModifier.Shift], key: 's' },
    execute: handleSaveAsFile,
  });
  actions.push({
    title: 'Delete',
    icon: <Trash2 className="w-4 h-4" />,
    shortcut: { modifiers: [KeyModifier.Ctrl], key: 'x' },
    execute: () => handleDeleteItem(),
    style: 'destructive',
  });
  actions.push({
    title: 'Delete All Entries',
    icon: <Trash2 className="w-4 h-4" />,
    shortcut: { modifiers: [KeyModifier.Ctrl, KeyModifier.Shift], key: 'x' },
    execute: handleClearAll,
    style: 'destructive',
  });

  useContainerShortcuts({
    actions,
    toggleActionPanel: () => setShowActions((v) => !v),
    pop: onClose,
    beforeActionExecute: () => setShowActions(false),
    afterActionExecute: () => requestAnimationFrame(() => inputRef.current?.focus()),
    overlayOpen: showActions,
    extraCommands: [
      {
        id: 'nav-down',
        plainKey: 'ArrowDown',
        handler: () => setSelectedIndex((prev) => prev < filteredItems.length - 1 ? prev + 1 : prev),
      },
      {
        id: 'nav-up',
        plainKey: 'ArrowUp',
        handler: () => setSelectedIndex((prev) => prev > 0 ? prev - 1 : 0),
      },
      {
        id: 'delete-backspace',
        plainKey: 'Backspace',
        modifierMatch: { meta: true },
        handler: () => { if (filteredItems[selectedIndex]) handleDeleteItem(); },
      },
      {
        id: 'delete-del',
        plainKey: 'Delete',
        modifierMatch: { meta: true },
        handler: () => { if (filteredItems[selectedIndex]) handleDeleteItem(); },
      },
    ],
  });

  const formatDate = (timestamp: number): string =>
    new Date(timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

  const getItemIcon = (type: string) => {
    switch (type) {
      case 'image':
        return <ImageIcon className="w-4 h-4" />;
      case 'url':
        return <Link className="w-4 h-4" />;
      case 'file':
        return <FileText className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  return (
    <div className="w-full h-full flex flex-col" tabIndex={-1}>
      {/* Header - transparent background same as main screen */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[var(--ui-divider)]">
        <button
          onClick={onClose}
          className="text-[var(--text-subtle)] hover:text-[var(--text-muted)] transition-colors flex-shrink-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0"
          tabIndex={-1}
          title="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search clipboard history..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 bg-transparent border-none outline-none text-[var(--text-primary)] placeholder:text-[color:var(--text-muted)] text-[15px] font-medium tracking-[0.005em]"
          autoFocus
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="text-[var(--text-subtle)] hover:text-[var(--text-muted)] transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-5 py-2.5 border-b border-[var(--ui-divider)]">
        {['all', 'text', 'image', 'url', 'file'].map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type as any)}
            className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
              filterType === type
                ? 'bg-[var(--ui-segment-active-bg)] text-[var(--text-primary)] border-[var(--ui-segment-border)]'
                : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-secondary)] hover:border-[var(--ui-segment-border)] hover:bg-[var(--ui-segment-hover-bg)]'
            }`}
          >
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Left: List (40%) */}
        <div
          ref={listRef}
          className="w-[40%] overflow-y-auto custom-scrollbar border-r border-[var(--ui-divider)]"
        >
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
              <p className="text-sm">Loading history...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
              <p className="text-sm">No items found</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filteredItems.map((item, index) => (
                <div
                  key={item.id}
                  ref={(el) => (itemRefs.current[index] = el)}
                  className={`px-2.5 py-2 rounded-md border cursor-pointer transition-colors ${
                    index === selectedIndex
                      ? 'bg-[var(--launcher-card-selected-bg)] border-transparent'
                      : 'border-transparent hover:border-[var(--launcher-card-border)] hover:bg-[var(--launcher-card-hover-bg)]'
                  }`}
                  onClick={() => setSelectedIndex(index)}
                  onDoubleClick={() => handlePasteItem(item)}
                >
                  <div className="flex items-center gap-2">
                    {item.type === 'image' ? (
                      <>
                        <img
                          src={`file://${item.content}`}
                          alt="Clipboard"
                          className="w-7 h-7 object-cover rounded flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-[var(--text-secondary)] text-[13px] truncate leading-tight">
                            Image
                          </div>
                          <div className="text-[var(--text-muted)] text-[11px] leading-tight">
                            {item.metadata?.width} × {item.metadata?.height}
                          </div>
                        </div>
                        {item.pinned ? (
                          <Pin className="w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0" />
                        ) : null}
                      </>
                    ) : (
                      <>
                        <div className="text-[var(--text-muted)] flex-shrink-0">
                          {getItemIcon(item.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[var(--text-secondary)] text-[13px] truncate">
                            {item.preview || item.content}
                          </div>
                        </div>
                        {item.pinned ? (
                          <Pin className="w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0" />
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Preview (60%) */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {selectedItem ? (
            <div className={selectedItem.type === 'image' ? 'p-1' : 'p-5'}>
              {selectedItem.type === 'image' ? (
                <div className="flex items-center justify-center">
                  <img
                    src={`file://${selectedItem.content}`}
                    alt="Clipboard"
                    className="w-full object-contain"
                    style={{ maxHeight: 'calc(75vh - 80px)' }}
                  />
                </div>
              ) : (
                <pre className="text-[var(--text-secondary)] text-xs whitespace-pre-wrap break-words font-mono leading-normal">
                  {selectedItem.content}
                </pre>
              )}

              <div className={selectedItem.type === 'image' ? 'px-5 pb-5 pt-3 border-t border-[var(--ui-divider)]' : 'mt-4 pt-3 border-t border-[var(--ui-divider)]'}>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-[var(--text-subtle)]">Date</span>
                  <span className="text-[var(--text-muted)] text-right truncate">
                    {formatDate(selectedItem.timestamp)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
              <p className="text-sm">Select an item to preview</p>
            </div>
          )}
        </div>
      </div>

      <ExtensionActionFooter
        leftContent={
          statusMessage ? (
            <span className="inline-flex items-center gap-2 min-w-0">
              {statusMessage.kind === 'success' ? (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/90 shadow-[0_0_0_3px_rgba(52,211,153,0.18)] flex-shrink-0" />
              ) : null}
              <span className="truncate text-[var(--text-secondary)]">{statusMessage.text}</span>
            </span>
          ) : (
            <span className="truncate">{filteredItems.length} items</span>
          )
        }
        primaryAction={
          selectedItem
            ? {
                label: actions[0].title,
                onClick: () => handlePasteItem(),
                shortcut: { key: 'enter' },
              }
            : undefined
        }
        actionsButton={{
          label: 'Actions',
          onClick: () => setShowActions(true),
          shortcut: { modifiers: [KeyModifier.Cmd], key: 'k' },
        }}
      />

      {/* Actions Overlay */}
      {showActions && (
        <InternalActionPanelOverlay
          actions={actions}
          onClose={() => {
            setShowActions(false);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          onExecute={(action) => action.execute()}
        />
      )}
    </div>
  );
};

export default ClipboardManager;
