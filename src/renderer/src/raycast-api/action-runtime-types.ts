/**
 * Action runtime shared types.
 *
 * Contains data contracts used by the action registry, action overlay,
 * and ActionPanel extraction helpers.
 */

export enum KeyModifier {
  Cmd = 'cmd',
  Ctrl = 'ctrl',
  Opt = 'opt',
  Shift = 'shift',
  Hyper = 'hyper',
}

export interface ActionShortcut {
  modifiers?: KeyModifier[];
  key?: string;
}

export interface ActionRegistration {
  id: string;
  title: string;
  icon?: any;
  shortcut?: ActionShortcut;
  style?: string;
  section?: { id: string; title?: string };
  execute: () => void;
  order: number;
}

export interface ActionRegistryAPI {
  register: (id: string, data: Omit<ActionRegistration, 'id'>) => void;
  unregister: (id: string) => void;
}

export interface ExtractedAction {
  id?: string;
  title: string;
  icon?: any;
  shortcut?: ActionShortcut;
  style?: string;
  section?: {id: string; title?: string};
  submenu?: ExtractedAction[];
  disabled?: boolean;
  execute: () => void;
}
