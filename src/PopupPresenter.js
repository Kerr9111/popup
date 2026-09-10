import {
  acquireBodyLock,
  getPopupRuntime,
  getTopmostPopup,
  registerPopup,
  releaseBodyLock,
  unregisterPopup,
  updatePopupZIndex,
} from "./PopupRuntime.js";

const DISTANCE_RATIO = 0.25;
const MIN_DISTANCE = 64;
const MAX_DISTANCE = 120;
const MIN_FLICK_DISTANCE = 16;
const FLICK_VELOCITY = 0.5;

export default class PopupPresenter {
  constructor(model, view) {
    this.model = model;
    this.view = view;
    this.runtime = getPopupRuntime();
    this._rootZIndex = null;
    this._responsiveWidth = null;
    this._closePromise = null;
    this._destroyedPromise = new Promise((resolve) => {
      this._resolveDestroyed = resolve;
    });
  }

  get isOpen() {
    return this.model.state.lifecycle === "open";
  }

  get lifecycle() {
    return this.model.state.lifecycle;
  }

  get element() {
    return this.view.el.box;
  }

  get panelElement() {
    return this.view.el.popup;
  }

  get contentElement() {
    return this.view.el.content;
  }

  setContent(content) {
    this.model.setContent(content);
    if (this.view.el.content) this.view.setContent(content);
    return this;
  }

  showPopup(options = {}) {
    this.model.assertUsable();
    if (this.model.state.lifecycle !== "idle") return this;

    if (Object.prototype.hasOwnProperty.call(options, "content")) {
      this.model.setContent(options.content);
    }
    this.model.configure(options);
    this.model.state.lifecycle = "opening";

    try {
      this._responsiveWidth = this._getViewportWidth();
      let effective = this.model.resolveResponsive(this._responsiveWidth);
      this._rootZIndex = registerPopup(
        this,
        this._getExplicitZIndex(effective.zIndex),
        this.runtime,
      );

      if (this.runtime.viewportState?.width !== this._responsiveWidth) {
        this._responsiveWidth = this.runtime.viewportState.width;
        effective = this.model.resolveResponsive(this._responsiveWidth);
      }

      if (this.model.state.lifecycle === "destroyed") return this;
      this.view.createSkeleton(effective);
      this.view.applyViewport(this.runtime.viewportState);
      this._applyEffectiveOptions(true);
      if (this.model.state.content) this.view.setContent(this.model.state.content);

      if (this.model.state.lifecycle === "destroyed") return this;
      this.model.state.lifecycle = "open";
      effective.onOpen?.({ popup: this });
      return this;
    } catch (error) {
      if (this.model.state.lifecycle !== "destroyed") {
        try {
          this._destroy(false);
        } catch {}
      }
      throw error;
    }
  }

  closePopup() {
    if (this.model.state.lifecycle === "destroyed") return Promise.resolve(false);
    if (this.model.state.lifecycle === "closing") return this._closePromise;
    if (this.model.state.lifecycle !== "open") return Promise.resolve(false);

    this.model.state.lifecycle = "closing";
    const operation = this._performClose();
    const trackedOperation = operation.finally(() => {
      if (this._closePromise === trackedOperation) this._closePromise = null;
    });
    this._closePromise = trackedOperation;
    return this._closePromise;
  }

  async _performClose() {
    const options = this.model.options;
    let allowed = true;

    try {
      if (options.beforeClose) {
        const hookResult = options.beforeClose({ popup: this });
        const outcome = await Promise.race([
          Promise.resolve(hookResult).then(
            (value) => ({ value }),
            (error) => ({ error }),
          ),
          this._destroyedPromise.then(() => ({ destroyed: true })),
        ]);
        if (outcome.destroyed) return true;
        if (Object.prototype.hasOwnProperty.call(outcome, "error")) throw outcome.error;
        allowed = outcome.value !== false;
      }
    } catch (error) {
      if (this.model.state.lifecycle === "closing") this.model.state.lifecycle = "open";
      throw error;
    }

    if (this.model.state.lifecycle === "destroyed") return true;
    if (!allowed) {
      this.model.state.lifecycle = "open";
      return false;
    }

    await this.view.animateOut(options.timeout, options.direction);
    if (this.model.state.lifecycle === "destroyed") return true;

    this._destroy(true);
    return true;
  }

  forceRemove() {
    if (this.model.state.lifecycle === "destroyed") return;
    this._destroy(true, true);
  }

  _destroy(invokeOnClose, forced = false) {
    if (this.model.state.lifecycle === "destroyed") return;

    this.model.state.lifecycle = "closing";
    const onClose = invokeOnClose ? this.model.options?.onClose : null;
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
    attempt(() => this.model.destroy());
    attempt(() => this._resolveDestroyed?.());

    this._rootZIndex = null;
    this._responsiveWidth = null;
    this._resolveDestroyed = null;

    let callbackError = null;
    if (onClose) {
      try {
        onClose({ popup: this, forced });
      } catch (error) {
        callbackError = error;
      }
    }

    if (cleanupError) throw cleanupError;
    if (callbackError) throw callbackError;
  }

  _applyEffectiveOptions(initial) {
    const options = this.model.options;
    if (!options || !this.view.el.box) return;

    if (options.scrollLock === false) releaseBodyLock(this, this.runtime);
    else acquireBodyLock(this, this.runtime);

    this._rootZIndex = updatePopupZIndex(
      this,
      this._getExplicitZIndex(options.zIndex),
      this.runtime,
    );
    this.view.applyOptions(options, this._rootZIndex, initial);
    this._attachHandlers();
    if (initial) this.view.animateIn(options.timeout);
  }

  _attachHandlers() {
    const swipeEnabled = this._isSwipeEnabled();
    this.view.attachHandlers({
      onBackdropClick: () => {
        if (this.model.options?.closeOnBackdrop !== false) this._requestClose();
      },
      onCloseClick: () => this._requestClose(),
      onPointerDown: (event) => this.onPointerDown(event),
      onPointerMove: (event) => this.onPointerMove(event),
      onPointerUp: (event) => this.onPointerUp(event),
      onPointerCancel: (event) => this.onPointerCancel(event),
      swipeEnabled,
    });
  }

  _requestClose() {
    this.closePopup().catch((error) => {
      queueMicrotask(() => {
        throw error;
      });
    });
  }

  _handleGlobalEscape() {
    if (this.model.options?.closeOnEscape === false) return;
    this._requestClose();
  }

  _handleRuntimeViewportChange(viewport) {
    if (this.model.state.lifecycle === "idle" || this.model.state.lifecycle === "destroyed") return;
    this.view.applyViewport(viewport);
    if (this.model.state.lifecycle === "closing" || this._responsiveWidth === viewport.width) return;

    this._responsiveWidth = viewport.width;
    this.view.releasePointer(this.model.state.pointerId);
    this.model.resetGesture();
    this.model.resolveResponsive(viewport.width);
    this._applyEffectiveOptions(false);
  }

  _getViewportWidth() {
    return this.runtime.viewportState?.width ?? window.visualViewport?.width ?? window.innerWidth;
  }

  _getExplicitZIndex(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  _canStartGesture(event) {
    const direction = this.model.options?.direction;
    return !!(
      this._isSwipeEnabled() &&
      direction &&
      this.model.state.lifecycle === "open" &&
      getTopmostPopup(this.runtime) === this &&
      event.isPrimary !== false &&
      (event.button === undefined || event.button === 0)
    );
  }

  _isSwipeEnabled() {
    const options = this.model.options;
    return options?.swipeEnabled !== false && options?.direction !== "center";
  }

  onPointerDown(event) {
    if (!this._canStartGesture(event)) return;
    this.model.startGesture(
      event.pointerId,
      event.clientX,
      event.clientY,
      getEventTime(event),
    );
    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    } catch {}
  }

  onPointerMove(event) {
    if (this.model.state.pointerId !== event.pointerId) return;
    const distance = this._getAxisDistance(event.clientX, event.clientY);
    if (this._getClosingDistance(distance) <= 0) return;

    event.preventDefault?.();
    this.view.applySwipeOffset(this.model.options.direction, distance);
  }

  onPointerUp(event) {
    if (this.model.state.pointerId !== event.pointerId) return;

    const direction = this.model.options.direction;
    const distance = this._getAxisDistance(event.clientX, event.clientY);
    const closingDistance = this._getClosingDistance(distance);
    const elapsed = Math.max(1, getEventTime(event) - this.model.state.startTime);
    const velocity = closingDistance / elapsed;
    const axisSize = this.view.getAxisSize(direction);
    const threshold = Math.min(
      MAX_DISTANCE,
      Math.max(MIN_DISTANCE, axisSize * DISTANCE_RATIO),
    );
    const shouldClose = closingDistance >= threshold || (
      closingDistance >= MIN_FLICK_DISTANCE && velocity >= FLICK_VELOCITY
    );

    this.model.resetGesture();
    this.view.resetSwipe(Math.min(this.model.options.timeout, 200));
    if (shouldClose) this._requestClose();
  }

  onPointerCancel(event) {
    if (this.model.state.pointerId !== event.pointerId) return;
    this.model.resetGesture();
    this.view.resetSwipe(Math.min(this.model.options.timeout, 200));
  }

  _getAxisDistance(clientX, clientY) {
    const direction = this.model.options.direction;
    if (direction === "leftToRight" || direction === "rightToLeft") {
      return clientX - this.model.state.startX;
    }
    return clientY - this.model.state.startY;
  }

  _getClosingDistance(distance) {
    const direction = this.model.options.direction;
    if (direction === "bottomToTop" || direction === "rightToLeft") return distance;
    return -distance;
  }
}

function getEventTime(event) {
  if (typeof event.timeStamp === "number" && Number.isFinite(event.timeStamp)) {
    return event.timeStamp;
  }
  return performance.now();
}
