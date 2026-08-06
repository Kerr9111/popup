export type PopupDirection = "bottomToTop" | "topToBottom" | "leftToRight" | "rightToLeft" | "";

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
  closeConfirm?: {
    title?: string;
    close?: boolean;
    saveAndClose?: boolean;
    cancel?: boolean;
  };
  lockClose?: boolean;
  callback?: () => void;
}

export default class Popup {
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
