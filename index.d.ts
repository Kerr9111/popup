export type PopupDirection = "bottomToTop" | "topToBottom" | "leftToRight" | "rightToLeft" | "";

export interface PopupOpenContext {
  popup: Popup;
}

export interface PopupCloseContext {
  popup: Popup;
  reason: "api" | "backdrop" | "close-button" | "escape" | "swipe" | "confirm-save" | "confirm-close" | "force" | string;
  forced: boolean;
}

export interface PopupButtonConfig {
  tag?: string;
  classList?: string[];
  props?: {
    textContent?: string;
    [key: string]: unknown;
  };
  events?: {
    click?: EventListener;
    [key: string]: EventListener | undefined;
  };
}

export interface PopupOptions {
  content?: string | HTMLElement;
  swipe?: {
    direction?: PopupDirection;
    timeout?: number;
  };
  styles?: {
    popup?: Partial<CSSStyleDeclaration> | Record<string, string | number>;
    bg?: Partial<CSSStyleDeclaration> | Record<string, string | number>;
  };
  data?: Record<string, unknown>;
  responsive?: Record<number, Partial<PopupOptions>>;
  showCloseBtn?: boolean;
  zIndex?: number;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  scrollLock?: boolean;
  closeConfirm?: {
    title?: string;
    close?: boolean;
    saveAndClose?: boolean;
    cancel?: boolean;
  };
  lockClose?: boolean;
  onOpen?: (context: PopupOpenContext) => void;
  onClose?: (context: PopupCloseContext) => void;
  callback?: () => void;
}

export default class Popup {
  readonly isOpen: boolean;
  readonly element: HTMLElement | null;
  readonly panelElement: HTMLElement | null;
  static create(options?: PopupOptions): Popup;
  setContent(content: string | HTMLElement): void;
  setCloseBtnIcon(): void;
  showPopup(options?: PopupOptions): void;
  closePopup(closeConfirmOption?: PopupOptions["closeConfirm"] | null): void;
  tryClose(confirmOpt?: PopupOptions["closeConfirm"] | null): void;
  forceRemove(): void;
  setSmartPopup(options?: {
    title?: string;
    description?: string;
    btns?: PopupButtonConfig[];
  }): HTMLElement;
}

export { Popup };
export const activePopups: Popup[];
