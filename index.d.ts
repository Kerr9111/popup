export type PopupDirection =
  | "center"
  | "leftToRight"
  | "rightToLeft"
  | "topToBottom"
  | "bottomToTop";

export type PopupLifecycle = "idle" | "opening" | "open" | "closing" | "destroyed";

export interface PopupContext {
  popup: Popup;
}

export interface PopupCloseContext extends PopupContext {
  forced: boolean;
}

export interface PopupResponsiveOptions {
  direction?: PopupDirection;
  timeout?: number;
  width?: string | null;
  maxWidth?: string | null;
  height?: string | null;
  maxHeight?: string | null;
  zIndex?: number | null;
  showCloseButton?: boolean;
  closeButtonLabel?: string;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  scrollLock?: boolean;
}

export interface PopupOptions extends PopupResponsiveOptions {
  content?: HTMLElement;
  beforeClose?: ((context: PopupContext) => boolean | Promise<boolean>) | null;
  onOpen?: ((context: PopupContext) => void) | null;
  onClose?: ((context: PopupCloseContext) => void) | null;
  responsive?: Record<number, PopupResponsiveOptions> | null;
}

export default class Popup {
  constructor(options?: PopupOptions);

  static create(options?: PopupOptions): Popup;

  readonly isOpen: boolean;
  readonly lifecycle: PopupLifecycle;
  readonly element: HTMLElement | null;
  readonly panelElement: HTMLElement | null;
  readonly contentElement: HTMLElement | null;

  setContent(content: HTMLElement): this;
  showPopup(options?: PopupOptions): this;
  closePopup(): Promise<boolean>;
  forceRemove(): void;
}

export { Popup };
