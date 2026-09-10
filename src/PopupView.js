import DOMUtils from "dom-utils-light";

const DIRECTION_CLASSES = [
  "fly-popup--center",
  "fly-popup--bottom-to-top",
  "fly-popup--top-to-bottom",
  "fly-popup--left-to-right",
  "fly-popup--right-to-left",
];

const DIRECTION_CLASS_MAP = {
  center: "fly-popup--center",
  bottomToTop: "fly-popup--bottom-to-top",
  topToBottom: "fly-popup--top-to-bottom",
  leftToRight: "fly-popup--left-to-right",
  rightToLeft: "fly-popup--right-to-left",
};

const SIZE_VARIABLES = {
  width: "--popup-width",
  maxWidth: "--popup-max-width",
  height: "--popup-height",
  maxHeight: "--popup-max-height",
};

export default class PopupView {
  constructor() {
    this.dom = new DOMUtils();
    this._timeouts = new Set();
    this._animationFrames = new Set();
    this._motionResolvers = new Set();
    this.el = this._emptyElements();
  }

  _emptyElements() {
    return {
      box: null,
      bg: null,
      popup: null,
      content: null,
      thumb: null,
      closeBtn: null,
    };
  }

  createSkeleton(options) {
    if (this.el.box) return;

    this.el.box = this.dom.createElement({ classList: ["fly-popup"] });
    this.el.bg = this.dom.createElement({ classList: ["fly-popup__background"] });
    this.el.popup = this.dom.createElement({
      classList: ["fly-popup__window"],
      attributes: { role: "dialog", "aria-modal": "true" },
    });
    this.el.content = this.dom.createElement({ classList: ["fly-popup__content"] });
    this.el.thumb = this.dom.createElement({
      classList: ["fly-popup__thumb"],
      attributes: { "aria-hidden": "true" },
    });

    this.el.popup.appendChild(this.el.content);
    this.el.popup.appendChild(this.el.thumb);
    this.el.box.appendChild(this.el.bg);
    this.el.box.appendChild(this.el.popup);
    document.body.appendChild(this.el.box);

    this.setCloseButton(options.showCloseButton !== false, options.closeButtonLabel);
  }

  setContent(content) {
    if (!this.el.content) return;
    this.el.content.innerHTML = "";
    this.el.content.classList.toggle(
      "fly-popup__content--iframe",
      content.tagName?.toLowerCase() === "iframe",
    );
    this.el.content.appendChild(content);
  }

  setCloseButton(show, label = "Close") {
    if (!this.el.popup) return;

    if (!show) {
      if (this.el.closeBtn) {
        this.el.closeBtn.onclick = null;
        this.el.closeBtn.remove();
        this.el.closeBtn = null;
      }
      return;
    }

    if (!this.el.closeBtn) {
      this.el.closeBtn = this.dom.createElement({
        tag: "button",
        classList: ["fly-popup__close"],
        props: { type: "button" },
      });
      this.el.closeBtn.innerHTML = `
        <svg aria-hidden="true" width="50" height="50" viewBox="0 0 50 50">
          <path d="M25 30.2308L14.3007 40.9301C13.5874 41.6434 12.7156 42 11.6853 42C10.655 42 9.78322 41.6434 9.06993 40.9301C8.35664 40.2168 8 39.345 8 38.3147C8 37.2844 8.35664 36.4126 9.06993 35.6993L19.7692 25L9.06993 14.3007C8.35664 13.5874 8 12.7156 8 11.6853C8 10.655 8.35664 9.78322 9.06993 9.06993C9.78322 8.35664 10.655 8 11.6853 8C12.7156 8 13.5874 8.35664 14.3007 9.06993L25 19.7692L35.6993 9.06993C36.4126 8.35664 37.2844 8 38.3147 8C39.345 8 40.2168 8.35664 40.9301 9.06993C41.6434 9.78322 42 10.655 42 11.6853C42 12.7156 41.6434 13.5874 40.9301 14.3007L30.2308 25L40.9301 35.6993C41.6434 36.4126 42 37.2844 42 38.3147C42 39.345 41.6434 40.2168 40.9301 40.9301C40.2168 41.6434 39.345 42 38.3147 42C37.2844 42 36.4126 41.6434 35.6993 40.9301L25 30.2308Z"/>
        </svg>
      `;
      this.el.popup.appendChild(this.el.closeBtn);
    }
    this.el.closeBtn.setAttribute("aria-label", label || "Close");
  }

  applyOptions(options, zIndex, initial = false) {
    if (!this.el.box || !this.el.popup || !this.el.bg) return;

    this.el.box.style.zIndex = String(zIndex);
    this.el.box.style.setProperty("--popup-z-index", String(zIndex));
    this.el.box.style.setProperty("--popup-animation-duration", `${options.timeout}ms`);
    for (const [key, variable] of Object.entries(SIZE_VARIABLES)) {
      if (options[key] === null) this.el.box.style.removeProperty(variable);
      else this.el.box.style.setProperty(variable, options[key]);
    }

    this.setCloseButton(options.showCloseButton !== false, options.closeButtonLabel);
    this.applyDirection(options.direction, initial);
  }

  applyDirection(direction, initial = false) {
    if (!this.el.box || !this.el.popup || !this.el.bg) return;

    this.cancelPendingOperations();
    this.el.box.classList.remove(...DIRECTION_CLASSES);
    this.el.box.classList.add(DIRECTION_CLASS_MAP[direction]);
    this.el.popup.style.transition = "";
    this.el.bg.style.transition = "";

    if (initial) {
      this.el.popup.style.transform = "";
      this.el.popup.style.opacity = "";
      this.el.bg.style.opacity = "";
      return;
    }

    this._applyOpenState();
  }

  animateIn(timeout) {
    if (!this.el.popup || !this.el.bg) return;
    const duration = normalizeDuration(timeout);
    if (duration === 0) {
      this.el.popup.style.transition = "none";
      this.el.bg.style.transition = "none";
      this._applyOpenState();
      return;
    }

    this.el.popup.style.transition = `transform ${duration}ms, opacity ${duration}ms`;
    this.el.bg.style.transition = `opacity ${duration}ms`;
    const popup = this.el.popup;
    this._scheduleFrame(() => {
      if (this.el.popup !== popup || !popup.isConnected) return;
      this._applyOpenState();
    });
  }

  animateOut(timeout, direction) {
    this.cancelPendingOperations();
    if (!this.el.popup || !this.el.bg) return Promise.resolve();

    const duration = normalizeDuration(timeout);
    this.el.popup.style.transition = duration === 0
      ? "none"
      : `transform ${duration}ms, opacity ${duration}ms`;
    this.el.bg.style.transition = duration === 0 ? "none" : `opacity ${duration}ms`;

    return new Promise((resolve) => {
      let settled = false;
      const complete = () => {
        if (settled) return;
        settled = true;
        this._motionResolvers.delete(complete);
        resolve();
      };
      this._motionResolvers.add(complete);

      const start = () => {
        this._applyClosedState(direction);
        if (duration === 0) complete();
        else this._scheduleTimeout(complete, duration);
      };

      if (duration === 0) start();
      else this._scheduleFrame(start);
    });
  }

  applySwipeOffset(direction, distance) {
    if (!this.el.popup || !this.el.bg) return;
    const axisSize = this.getAxisSize(direction);
    const signedDistance = getClosingDistance(direction, distance);
    const progress = Math.min(Math.max(signedDistance / axisSize, 0), 1);
    const percent = progress * 100;

    this.el.popup.style.transition = "none";
    this.el.bg.style.transition = "none";
    this.el.bg.style.opacity = String(1 - progress);

    if (direction === "bottomToTop") {
      this.el.popup.style.transform = `translate3d(0, ${percent}%, 0)`;
    } else if (direction === "topToBottom") {
      this.el.popup.style.transform = `translate3d(0, ${-percent}%, 0)`;
    } else if (direction === "leftToRight") {
      this.el.popup.style.transform = `translate3d(${-percent}%, 0, 0)`;
    } else if (direction === "rightToLeft") {
      this.el.popup.style.transform = `translate3d(${percent}%, 0, 0)`;
    }
  }

  resetSwipe(timeout) {
    this.cancelPendingOperations();
    if (!this.el.popup || !this.el.bg) return;
    const duration = normalizeDuration(timeout);
    this.el.popup.style.transition = duration === 0
      ? "none"
      : `transform ${duration}ms, opacity ${duration}ms`;
    this.el.bg.style.transition = duration === 0 ? "none" : `opacity ${duration}ms`;

    if (duration === 0) this._applyOpenState();
    else this._scheduleFrame(() => this._applyOpenState());
  }

  getAxisSize(direction) {
    const rect = this.el.popup?.getBoundingClientRect?.();
    const horizontal = direction === "leftToRight" || direction === "rightToLeft";
    const size = horizontal ? rect?.width : rect?.height;
    return Math.max(1, size || (horizontal ? window.innerWidth : window.innerHeight));
  }

  attachHandlers({ onBackdropClick, onCloseClick, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }) {
    this.detachHandlers();
    if (!this.el.bg || !this.el.thumb) return;

    this.el.bg.onclick = onBackdropClick || null;
    this.el.thumb.onpointerdown = onPointerDown || null;
    this.el.thumb.onpointermove = onPointerMove || null;
    this.el.thumb.onpointerup = onPointerUp || null;
    this.el.thumb.onpointercancel = onPointerCancel || null;
    if (this.el.closeBtn) this.el.closeBtn.onclick = onCloseClick || null;
  }

  detachHandlers() {
    if (this.el.bg) this.el.bg.onclick = null;
    if (this.el.closeBtn) this.el.closeBtn.onclick = null;
    if (this.el.thumb) {
      this.el.thumb.onpointerdown = null;
      this.el.thumb.onpointermove = null;
      this.el.thumb.onpointerup = null;
      this.el.thumb.onpointercancel = null;
    }
  }

  applyViewport(viewport) {
    if (!this.el.box || !viewport) return;
    this.el.box.style.setProperty("--popup-viewport-height", `${viewport.height}px`);
    this.el.box.style.setProperty("--popup-viewport-width", `${viewport.width}px`);
    this.el.box.style.setProperty("--popup-viewport-offset-top", `${viewport.offsetTop}px`);
    this.el.box.style.setProperty("--popup-viewport-offset-left", `${viewport.offsetLeft}px`);
  }

  cancelPendingOperations() {
    const win = typeof window === "undefined" ? null : window;
    for (const id of this._animationFrames) win?.cancelAnimationFrame?.(id);
    for (const id of this._timeouts) clearTimeout(id);
    this._animationFrames.clear();
    this._timeouts.clear();

    const resolvers = [...this._motionResolvers];
    this._motionResolvers.clear();
    resolvers.forEach((resolve) => resolve());
  }

  remove() {
    this.cancelPendingOperations();
    this.detachHandlers();
    this.el.box?.remove();
    this.el = this._emptyElements();
  }

  _applyOpenState() {
    if (!this.el.popup || !this.el.bg) return;
    this.el.popup.style.transform = "translate3d(0,0,0)";
    this.el.popup.style.opacity = "1";
    this.el.bg.style.opacity = "1";
  }

  _applyClosedState(direction) {
    if (!this.el.popup || !this.el.bg) return;
    this.el.bg.style.opacity = "0";
    this.el.popup.style.opacity = direction === "center" ? "0" : "1";

    if (direction === "bottomToTop") {
      this.el.popup.style.transform = "translate3d(0,100%,0)";
    } else if (direction === "topToBottom") {
      this.el.popup.style.transform = "translate3d(0,-100%,0)";
    } else if (direction === "leftToRight") {
      this.el.popup.style.transform = "translate3d(-100%,0,0)";
    } else if (direction === "rightToLeft") {
      this.el.popup.style.transform = "translate3d(100%,0,0)";
    } else {
      this.el.popup.style.transform = "scale(0.98)";
    }
  }

  _scheduleFrame(callback) {
    const win = typeof window === "undefined" ? null : window;
    if (win?.requestAnimationFrame) {
      let id = 0;
      id = win.requestAnimationFrame(() => {
        this._animationFrames.delete(id);
        callback();
      });
      this._animationFrames.add(id);
      return;
    }
    this._scheduleTimeout(callback, 16);
  }

  _scheduleTimeout(callback, timeout) {
    const id = setTimeout(() => {
      this._timeouts.delete(id);
      callback();
    }, timeout);
    this._timeouts.add(id);
  }
}

function normalizeDuration(timeout) {
  return Math.max(0, Number(timeout) || 0);
}

function getClosingDistance(direction, distance) {
  if (direction === "bottomToTop" || direction === "rightToLeft") return distance;
  if (direction === "topToBottom" || direction === "leftToRight") return -distance;
  return 0;
}
