import DOMUtils from "dom-utils-light";

const DIRECTION_CLASSES = [
  "fly-popup--bottom-to-top",
  "fly-popup--top-to-bottom",
  "fly-popup--left-to-right",
  "fly-popup--right-to-left",
];

const DIRECTION_CLASS_MAP = {
  bottomToTop: "fly-popup--bottom-to-top",
  topToBottom: "fly-popup--top-to-bottom",
  leftToRight: "fly-popup--left-to-right",
  rightToLeft: "fly-popup--right-to-left",
};

export default class PopupView {
  constructor() {
    this.dom = new DOMUtils();
    this._timeouts = new Set();
    this._animationFrames = new Set();
    this._popupStyleKeys = new Set();
    this._bgStyleKeys = new Set();

    this.el = this._emptyElements();
  }

  _emptyElements() {
    return {
      box: null,
      bg: null,
      popup: null,
      thumb: null,
      closeBtn: null,
      confirmWrap: null,
    };
  }

  createSkeleton(styles = {}, showCloseBtn = true) {
    if (this.el.box) return;

    this.el.box = this.dom.createElement({ classList: ["fly-popup"] });
    this.el.bg = this.dom.createElement({ classList: ["fly-popup__background"] });
    this.el.popup = this.dom.createElement({
      classList: ["fly-popup__window"],
      attributes: { role: "dialog", "aria-modal": "true" },
    });
    this.el.thumb = this.dom.createElement({ classList: ["fly-popup__thumb"] });

    this.el.box.appendChild(this.el.bg);
    this.el.box.appendChild(this.el.popup);
    document.body.appendChild(this.el.box);

    this.el.popup.appendChild(this.el.thumb);
    this.setCloseButtonVisible(showCloseBtn);
    this.applyStyles(styles);
  }

  setCloseButtonVisible(show) {
    if (!this.el.popup) return;

    if (!show) {
      if (this.el.closeBtn) {
        this.el.closeBtn.onclick = null;
        this.el.closeBtn.onkeydown = null;
        this.el.closeBtn.remove();
        this.el.closeBtn = null;
      }
      return;
    }

    if (!this.el.closeBtn) {
      this.el.closeBtn = this.dom.createElement({
        classList: ["fly-popup__close"],
        attributes: {
          role: "button",
          tabindex: "0",
          "aria-label": "Close",
        },
      });
    }
    this.el.popup.appendChild(this.el.closeBtn);
  }

  setCloseBtnIcon(html) {
    if (this.el.closeBtn) this.el.closeBtn.innerHTML = html || "";
  }

  mountContent(content) {
    if (!this.el.popup) return;

    this.el.popup.innerHTML = "";
    if (typeof content === "string") {
      this.el.popup.innerHTML = content;
    } else if (content instanceof HTMLElement) {
      this.el.popup.appendChild(content);
    }

    this.el.popup.appendChild(this.el.thumb);
    if (this.el.closeBtn) this.el.popup.appendChild(this.el.closeBtn);
  }

  applyStyles(styles = {}) {
    this._replaceStyles(this.el.popup, styles.popup || {}, this._popupStyleKeys);
    this._replaceStyles(this.el.bg, styles.bg || {}, this._bgStyleKeys);
  }

  _replaceStyles(element, styles, previousKeys) {
    if (!element) return;
    for (const key of previousKeys) element.style[key] = "";
    previousKeys.clear();
    for (const key of Object.keys(styles)) previousKeys.add(key);
    this.dom.setStyles(element, styles);
  }

  applyDirection(direction, initial = true) {
    const box = this.el.box;
    const popup = this.el.popup;
    if (!box || !popup) return;

    box.classList.remove(...DIRECTION_CLASSES);
    const directionClass = DIRECTION_CLASS_MAP[direction];
    if (directionClass) box.classList.add(directionClass);

    popup.style.transition = "";
    this.el.bg.style.transition = "";
    this.el.bg.style.opacity = "";
    popup.style.transform = directionClass && initial ? "" : "translate3d(0,0,0)";
  }

  animateIn(timeout = 300) {
    const popup = this.el.popup;
    if (!popup) return;

    const duration = Math.max(0, Number(timeout) || 0);
    if (duration === 0) {
      popup.style.transition = "none";
      popup.style.transform = "translate3d(0,0,0)";
      return;
    }

    this._scheduleFrame(() => {
      if (this.el.popup !== popup || !popup.isConnected) return;
      popup.style.transition = `transform ${duration}ms`;
      popup.style.transform = "translate3d(0,0,0)";
    });
  }

  applySwipeFrame(direction, percent) {
    const popup = this.el.popup;
    const bg = this.el.bg;
    if (!popup || !bg) return;

    switch (direction) {
      case "bottomToTop": {
        const value = Math.min(Math.max(percent, 0), 100);
        popup.style.transform = `translate3d(0, ${value}%, 0)`;
        bg.style.opacity = 1 - value / 100;
        break;
      }
      case "topToBottom": {
        const value = Math.min(Math.max(percent, -100), 0);
        popup.style.transform = `translate3d(0, ${value}%, 0)`;
        bg.style.opacity = 1 + value / 100;
        break;
      }
      case "leftToRight": {
        const value = Math.min(Math.max(percent, -100), 0);
        popup.style.transform = `translate3d(${value}%, 0, 0)`;
        bg.style.opacity = 1 + value / 100;
        break;
      }
      case "rightToLeft": {
        const value = Math.min(Math.max(percent, 0), 100);
        popup.style.transform = `translate3d(${value}%, 0, 0)`;
        bg.style.opacity = 1 - value / 100;
        break;
      }
      default:
        break;
    }
  }

  resetSwipeFrame(timeout = 300) {
    const popup = this.el.popup;
    const bg = this.el.bg;
    if (!popup || !bg) return;

    const duration = Math.max(0, Number(timeout) || 0);
    const transition = duration === 0 ? "none" : `transform ${duration}ms`;
    popup.style.transition = transition;
    bg.style.transition = duration === 0 ? "none" : `opacity ${duration}ms`;

    this._scheduleFrame(() => {
      if (this.el.popup !== popup || this.el.bg !== bg || !popup.isConnected) return;
      popup.style.transform = "translate3d(0,0,0)";
      bg.style.opacity = "1";
    });
  }

  attachHandlers({
    onBgClick,
    onCloseClick,
    onPointerDown,
    onPointerMove,
    onPointerEnd,
    onPointerCancel,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
  }) {
    this.detachHandlers();
    if (!this.el.bg || !this.el.thumb) return;

    this.el.bg.onclick = onBgClick || null;
    if (this.el.closeBtn) {
      this.el.closeBtn.onclick = onCloseClick || null;
      this.el.closeBtn.onkeydown = (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onCloseClick?.(event);
      };
    }

    const targets = [this.el.bg, this.el.thumb];
    if (typeof window !== "undefined" && "PointerEvent" in window) {
      for (const target of targets) {
        target.onpointerdown = onPointerDown || null;
        target.onpointermove = onPointerMove || null;
        target.onpointerup = onPointerEnd || null;
        target.onpointercancel = onPointerCancel || null;
      }
      return;
    }

    for (const target of targets) {
      target.ontouchstart = onTouchStart || null;
      target.ontouchmove = onTouchMove || null;
      target.ontouchend = onTouchEnd || null;
      target.ontouchcancel = onTouchCancel || null;
    }
  }

  detachHandlers() {
    for (const target of [this.el.bg, this.el.thumb]) {
      if (!target) continue;
      target.onclick = null;
      target.onpointerdown = null;
      target.onpointermove = null;
      target.onpointerup = null;
      target.onpointercancel = null;
      target.ontouchstart = null;
      target.ontouchmove = null;
      target.ontouchend = null;
      target.ontouchcancel = null;
    }
    if (this.el.closeBtn) {
      this.el.closeBtn.onclick = null;
      this.el.closeBtn.onkeydown = null;
    }
  }

  applyViewport(viewport) {
    if (!this.el.box || !viewport) return;
    this.el.box.style.setProperty("--popup-viewport-height", `${viewport.height}px`);
    this.el.box.style.setProperty("--popup-viewport-width", `${viewport.width}px`);
    this.el.box.style.setProperty("--popup-viewport-offset-top", `${viewport.offsetTop}px`);
    this.el.box.style.setProperty("--popup-viewport-offset-left", `${viewport.offsetLeft}px`);
  }

  setRootZIndex(zIndex) {
    if (this.el.box && Number.isFinite(zIndex)) this.el.box.style.zIndex = String(zIndex);
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

    const id = setTimeout(() => {
      this._timeouts.delete(id);
      callback();
    }, 16);
    this._timeouts.add(id);
  }

  cancelPendingOperations() {
    const win = typeof window === "undefined" ? null : window;
    for (const id of this._animationFrames) win?.cancelAnimationFrame?.(id);
    for (const id of this._timeouts) clearTimeout(id);
    this._animationFrames.clear();
    this._timeouts.clear();
  }

  remove() {
    this.cancelPendingOperations();
    this.detachHandlers();
    this.hideCloseConfirm();
    this.el.box?.remove();
    this.el = this._emptyElements();
    this._popupStyleKeys.clear();
    this._bgStyleKeys.clear();
  }

  showCloseConfirm({ title, onSaveAndClose, onClose, onCancel }) {
    if (!this.el.box || !this.el.popup || this.el.confirmWrap?.isConnected) return;
    this.el.confirmWrap = null;

    const wrap = this.dom.createElement({
      classList: ["fly-popup__close-confirm"],
      children: [{ classList: ["fly-popup__close-confirm-background"] }],
    });

    const content = this.dom.createElement({
      classList: ["fly-popup__close-confirm-content"],
      attributes: { role: "alertdialog", "aria-modal": "true" },
      children: [
        {
          classList: ["fly-popup__close-confirm-title"],
          props: {
            textContent: title || "Are you sure you want to close this window?",
          },
        },
      ],
    });

    const createButton = (text, classList, handler) =>
      this.dom.createElement({
        tag: "span",
        classList,
        props: { textContent: text },
        events: { click: handler },
      });

    if (onSaveAndClose) {
      content.appendChild(
        createButton(
          "Save",
          ["fly-popup__button", "fly-popup__button--blue", "fly-popup__confirm-button"],
          onSaveAndClose,
        ),
      );
    }

    if (onClose) {
      content.appendChild(
        createButton(
          "Close",
          ["fly-popup__button", "fly-popup__button--red", "fly-popup__confirm-button"],
          onClose,
        ),
      );
    }

    if (onCancel) {
      content.appendChild(
        createButton(
          "Back",
          ["fly-popup__button", "fly-popup__button--gray", "fly-popup__confirm-button"],
          onCancel,
        ),
      );
    }

    wrap.appendChild(content);
    this.el.box.appendChild(wrap);
    wrap.onclick = (event) => {
      if (
        event.target === wrap ||
        event.target.classList?.contains("fly-popup__close-confirm-background")
      ) {
        this.hideCloseConfirm();
      }
    };

    this.el.confirmWrap = wrap;
  }

  hideCloseConfirm() {
    if (this.el.confirmWrap) this.el.confirmWrap.onclick = null;
    this.el.confirmWrap?.remove();
    this.el.confirmWrap = null;
  }
}
