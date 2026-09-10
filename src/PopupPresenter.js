import {
  acquireBodyLock,
  activePopups,
  getPopupRuntime,
  getTopmostPopup,
  registerPopup,
  releaseBodyLock,
  unregisterPopup,
  updatePopupZIndex,
} from "./PopupRuntime.js";

const CLOSE_ICON = `
  <svg aria-hidden="true" width="50" height="50" viewBox="0 0 50 50">
    <path d="M25 30.2308L14.3007 40.9301C13.5874 41.6434 12.7156 42 11.6853 42C10.655 42 9.78322 41.6434 9.06993 40.9301C8.35664 40.2168 8 39.345 8 38.3147C8 37.2844 8.35664 36.4126 9.06993 35.6993L19.7692 25L9.06993 14.3007C8.35664 13.5874 8 12.7156 8 11.6853C8 10.655 8.35664 9.78322 9.06993 9.06993C9.78322 8.35664 10.655 8 11.6853 8C12.7156 8 13.5874 8.35664 14.3007 9.06993L25 19.7692L35.6993 9.06993C36.4126 8.35664 37.2844 8 38.3147 8C39.345 8 40.2168 8.35664 40.9301 9.06993C41.6434 9.78322 42 10.655 42 11.6853C42 12.7156 41.6434 13.5874 40.9301 14.3007L30.2308 25L40.9301 35.6993C41.6434 36.4126 42 37.2844 42 38.3147C42 39.345 41.6434 40.2168 40.9301 40.9301C40.2168 41.6434 39.345 42 38.3147 42C37.2844 42 36.4126 41.6434 35.6993 40.9301L25 30.2308Z"/>
  </svg>
`;

export default class PopupPresenter {
  static activePopups = activePopups;

  constructor(model, view) {
    this.model = model;
    this.view = view;
    this.runtime = getPopupRuntime();
    this._rootZIndex = null;
    this._responsiveWidth = null;
  }

  get isOpen() {
    return this.model.state.lifecycle === "open";
  }

  get element() {
    return this.view.el.box;
  }

  get panelElement() {
    return this.view.el.popup;
  }

  setContent(content) {
    this.model.setContent(content);
    if (this.view.el.popup) this.view.mountContent(content);
  }

  setCloseBtnIcon() {
    if (this.view.el.closeBtn) this.view.setCloseBtnIcon(CLOSE_ICON);
  }

  showPopup(options = {}) {
    if (this.model.state.lifecycle !== "idle") return;

    this.model.state.lifecycle = "opening";
    try {
      if (Object.prototype.hasOwnProperty.call(options, "content")) {
        this.model.setContent(options.content);
      }

      this.model.setOptions(options);
      this._responsiveWidth = this._getViewportWidth();
      this.model.setResponsiveOptions(this._responsiveWidth);
      const effective = this.model.options;

      this._rootZIndex = registerPopup(this, this._getExplicitZIndex(effective.zIndex), this.runtime);
      this.view.createSkeleton(effective.styles, effective.showCloseBtn !== false);
      this.view.setRootZIndex(this._rootZIndex);
      this.view.applyViewport(this.runtime.viewportState);

      this.model.setOnClose(options.callback, options.onClose);
      this._applyEffectiveOptions(true);

      if (this.model.state.content !== null && this.model.state.content !== undefined) {
        this.view.mountContent(this.model.state.content);
      }

      this.model.state.isOpen = true;
      this.model.state.lifecycle = "open";

      options.onOpen?.({ popup: this });
    } catch (error) {
      try {
        this._cleanup();
      } catch {}
      throw error;
    }
  }

  closePopup(closeConfirmOption = this.model.options.closeConfirm) {
    this.tryClose(closeConfirmOption, "api");
  }

  tryClose(confirmOpt, reason = "api") {
    if (this.model.state.lifecycle !== "open") return;
    if (this.model.state.lockClose === true) return;

    const hasConfirm = !!(
      confirmOpt?.close ||
      confirmOpt?.cancel ||
      confirmOpt?.saveAndClose
    );
    if (!hasConfirm) {
      this._remove(reason, false);
      return;
    }

    this.view.showCloseConfirm({
      title: confirmOpt?.title || "",
      onSaveAndClose: confirmOpt?.saveAndClose
        ? () => {
          this.view.hideCloseConfirm();
          this._remove("confirm-save", false);
        }
        : null,
      onClose: confirmOpt?.close
        ? () => {
          this.view.hideCloseConfirm();
          this._remove("confirm-close", false);
        }
        : null,
      onCancel: confirmOpt?.cancel ? () => this.view.hideCloseConfirm() : null,
    });
  }

  forceRemove() {
    this._remove("force", true);
  }

  _remove(reason, forced) {
    if (
      this.model.state.lifecycle === "idle" ||
      this.model.state.lifecycle === "closing"
    ) {
      return;
    }

    const callbacks = this.model.takeOnCloseCallbacks();
    let cleanupError = null;
    try {
      this._cleanup();
    } catch (error) {
      cleanupError = error;
    }

    let callbackError = null;
    const context = { popup: this, reason, forced };
    for (const callback of callbacks) {
      try {
        callback(context);
      } catch (error) {
        callbackError ||= error;
      }
    }
    if (cleanupError) throw cleanupError;
    if (callbackError) throw callbackError;
  }

  _cleanup() {
    if (this.model.state.lifecycle === "idle") return;

    this.model.state.lifecycle = "closing";
    this.model.state.isOpen = false;
    let cleanupError = null;
    const attempt = (operation) => {
      try {
        operation();
      } catch (error) {
        cleanupError ||= error;
      }
    };

    attempt(() => unregisterPopup(this, this.runtime));
    attempt(() => this.view.cancelPendingOperations());
    attempt(() => this.view.detachHandlers());
    attempt(() => releaseBodyLock(this, this.runtime));
    attempt(() => this.view.remove());
    attempt(() => this.model.resetTouchStart());
    attempt(() => this.model.setLockClose(false));
    attempt(() => this.model.takeOnCloseCallbacks());

    this._rootZIndex = null;
    this._responsiveWidth = null;
    this.model.state.lifecycle = "idle";
    if (cleanupError) throw cleanupError;
  }

  _applyEffectiveOptions(initial = false) {
    const options = this.model.options;
    if (!this.view.el.box) return;

    if (options.scrollLock === false) releaseBodyLock(this, this.runtime);
    else acquireBodyLock(this, this.runtime);

    this._rootZIndex = updatePopupZIndex(
      this,
      this._getExplicitZIndex(options.zIndex),
      this.runtime,
    );
    this.view.setRootZIndex(this._rootZIndex);
    this.view.applyStyles(options.styles);
    this.view.setCloseButtonVisible(options.showCloseBtn !== false);
    if (options.showCloseBtn !== false) this.setCloseBtnIcon();
    this.view.applyDirection(options.swipe?.direction, initial);
    this.model.setLockClose(options.lockClose === true);
    this._attachHandlers();

    if (initial && options.swipe?.direction) {
      this.view.animateIn(options.swipe.timeout ?? 300);
    }
  }

  _attachHandlers() {
    this.view.attachHandlers({
      onBgClick: () => {
        if (this.model.options.closeOnBackdrop !== false) {
          this.tryClose(this.model.options.closeConfirm, "backdrop");
        }
      },
      onCloseClick: () => this.tryClose(this.model.options.closeConfirm, "close-button"),
      onPointerDown: (event) => this.onPointerDown(event),
      onPointerMove: (event) => this.onPointerMove(event),
      onPointerEnd: (event) => this.onPointerEnd(event),
      onPointerCancel: () => this.onPointerCancel(),
      onTouchStart: (event) => this.onTouchStart(event),
      onTouchMove: (event) => this.onTouchMove(event),
      onTouchEnd: (event) => this.onTouchEnd(event),
      onTouchCancel: () => this.onPointerCancel(),
    });
  }

  _handleGlobalEscape() {
    if (this.model.options.closeOnEscape === false) return;
    this.tryClose(this.model.options.closeConfirm, "escape");
  }

  _handleRuntimeViewportChange(viewport) {
    if (this.model.state.lifecycle === "idle") return;
    this.view.applyViewport(viewport);
    if (this._responsiveWidth === viewport.width) return;

    this._responsiveWidth = viewport.width;
    this.model.setResponsiveOptions(viewport.width);
    this._applyEffectiveOptions(false);
  }

  _getViewportWidth() {
    return this.runtime.viewportState?.width ?? window.innerWidth;
  }

  _getExplicitZIndex(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  _canStartGesture() {
    return !!(
      this.model.options.swipe?.direction &&
      this.model.state.lifecycle === "open" &&
      getTopmostPopup(this.runtime) === this
    );
  }

  onPointerDown(event) {
    if (!this._canStartGesture() || event.isPrimary === false) return;
    this.model.setActivePointerId(event.pointerId);
    this.model.setStartX(event.clientX);
    this.model.setStartY(event.clientY);
    event.currentTarget?.setPointerCapture?.(event.pointerId);
  }

  onPointerMove(event) {
    if (this.model.state.activePointerId !== event.pointerId) return;
    this._moveGesture(event.clientX, event.clientY, event);
  }

  onPointerEnd(event) {
    if (this.model.state.activePointerId !== event.pointerId) return;
    this._finishGesture(event.clientX, event.clientY, false);
  }

  onPointerCancel() {
    if (this.model.state.startX === null && this.model.state.startY === null) return;
    this.view.resetSwipeFrame(this.model.options.swipe?.timeout ?? 300);
    this.model.resetTouchStart();
  }

  onTouchStart(event) {
    if (!this._canStartGesture()) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    this.model.setStartX(touch.clientX);
    this.model.setStartY(touch.clientY);
  }

  onTouchMove(event) {
    const touch = event.touches?.[0] || event.changedTouches?.[0];
    if (!touch || this.model.state.startX === null) return;
    this._moveGesture(touch.clientX, touch.clientY, event);
  }

  onTouchEnd(event) {
    const touch = event.changedTouches?.[0] || event.touches?.[0];
    if (!touch || this.model.state.startX === null) return;
    this._finishGesture(touch.clientX, touch.clientY, false);
  }

  _moveGesture(clientX, clientY, event) {
    const direction = this.model.options.swipe?.direction;
    if (!direction) return;

    event.preventDefault?.();
    this.view.el.popup.style.transition = "";
    this.view.el.bg.style.transition = "";
    this.view.applySwipeFrame(direction, this._getGesturePercent(clientX, clientY, direction));
  }

  _finishGesture(clientX, clientY, cancelled) {
    const { swipe, closeConfirm } = this.model.options;
    const direction = swipe?.direction;
    if (!direction) {
      this.model.resetTouchStart();
      return;
    }

    const percent = this._getGesturePercent(clientX, clientY, direction);
    const allowClose = !cancelled && !this.model.state.lockClose && this._passesThreshold(
      direction,
      percent,
    );

    this.view.resetSwipeFrame(swipe.timeout ?? 300);
    this.model.resetTouchStart();
    if (allowClose) this.tryClose(closeConfirm, "swipe");
  }

  _getGesturePercent(clientX, clientY, direction) {
    const horizontal = direction === "leftToRight" || direction === "rightToLeft";
    const size = horizontal
      ? this.runtime.viewportState?.width || window.innerWidth
      : this.runtime.viewportState?.height || window.innerHeight;
    const delta = horizontal
      ? clientX - this.model.state.startX
      : clientY - this.model.state.startY;
    return size > 0 ? (delta * 100) / size : 0;
  }

  _passesThreshold(direction, percent) {
    if (direction === "bottomToTop" || direction === "rightToLeft") return percent > 10;
    if (direction === "topToBottom" || direction === "leftToRight") return percent < -10;
    return false;
  }

  setSmartPopup(options = {}) {
    const defaults = {
      title: "Save changes?",
      description: "",
      btns: [
        {
          tag: "button",
          classList: ["fly-popup__button", "fly-popup__button--red"],
          props: { textContent: "No" },
          events: { click: () => this.closePopup() },
        },
      ],
    };
    const opts = { ...defaults, ...options };
    const content = document.createElement("div");
    content.className = "fly-popup__confirm";

    const title = document.createElement("div");
    title.className = "fly-popup__confirm-title";
    title.textContent = opts.title ?? "";

    const description = document.createElement("div");
    description.className = "fly-popup__confirm-description";
    description.textContent = opts.description ?? "";

    const footer = document.createElement("div");
    footer.className = "fly-popup__confirm-footer";
    content.append(title, description, footer);

    (opts.btns || []).forEach((btn) => {
      const el = document.createElement(btn.tag || "button");
      (btn.classList || []).forEach((className) => el.classList.add(className));
      if (btn.props?.textContent !== undefined) el.textContent = btn.props.textContent;
      if (btn.events?.click) el.addEventListener("click", btn.events.click);
      footer.appendChild(el);
    });

    return content;
  }
}
