import DOMUtils from "dom-utils-light";

export default class PopupView {
  constructor() {
    this.dom = new DOMUtils();
    this.bodyLockState = {
      overflow: "",
      paddingRight: "",
    };

    this.el = {
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
    this.el.bg = this.dom.createElement({
      classList: ["fly-popup__background"],
      styles: styles.bg || {},
    });
    this.el.popup = this.dom.createElement({
      classList: ["fly-popup__window"],
      styles: styles.popup || {},
    });
    this.el.thumb = this.dom.createElement({ classList: ["fly-popup__thumb"] });
    if (showCloseBtn) {
      this.el.closeBtn = this.dom.createElement({ classList: ["fly-popup__close"] });
    }

    this.el.box.appendChild(this.el.bg);
    this.el.box.appendChild(this.el.popup);
    document.body.appendChild(this.el.box);
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

  applyDirection(direction) {
    const box = this.el.box;
    const popup = this.el.popup;

    box.classList.remove(
      "fly-popup--bottom-to-top",
      "fly-popup--top-to-bottom",
      "fly-popup--left-to-right",
      "fly-popup--right-to-left",
    );
    switch (direction) {
      case "bottomToTop":
        box.classList.add("fly-popup--bottom-to-top");
        break;
      case "topToBottom":
        box.classList.add("fly-popup--top-to-bottom");
        break;
      case "leftToRight":
        box.classList.add("fly-popup--left-to-right");
        break;
      case "rightToLeft":
        box.classList.add("fly-popup--right-to-left");
        break;
      default: {
        const rect = popup.getBoundingClientRect();
        let y = window.scrollY + window.innerHeight / 2 - rect.height / 2;
        if (y < 30) y = 30;
        this.dom.setStyles(popup, { top: `${y}px` });
      }
    }
  }

  animateIn(timeout = 300) {
    const popup = this.el.popup;
    setTimeout(() => {
      popup.style.transition = `transform ${timeout}ms`;
      popup.style.transform = "translate3d(0,0,0)";
    }, 10);
  }

  applySwipeFrame(direction, percent) {
    const popup = this.el.popup;
    const bg = this.el.bg;

    switch (direction) {
      case "bottomToTop":
        popup.style.transform = `translate3d(0, ${Math.max(percent, 0)}%, 0)`;
        bg.style.opacity = 1 - Math.max(percent, 0) / 100 + 0.1;
        break;
      case "topToBottom":
        popup.style.transform = `translate3d(0, ${Math.min(Math.max(percent, -100), 0)}%, 0)`;
        bg.style.opacity = 1 + Math.min(Math.max(percent, -100), 0) / 100 + 0.1;
        break;
      case "leftToRight":
        popup.style.transform = `translate3d(${Math.min(Math.max(percent, -100), 0)}%, 0, 0)`;
        bg.style.opacity = 1 + Math.min(Math.max(percent, -100), 0) / 100 + 0.1;
        break;
      case "rightToLeft":
        popup.style.transform = `translate3d(${Math.max(Math.min(percent, 100), 0)}%, 0, 0)`;
        bg.style.opacity = 1 - Math.max(Math.min(percent, 100), 0) / 100 + 0.1;
        break;
      default:
        break;
    }
  }

  resetSwipeFrame(timeout = 300) {
    const popup = this.el.popup;
    const bg = this.el.bg;

    bg.style.transition = `opacity ${timeout}ms`;
    setTimeout(() => (bg.style.opacity = 1), 10);
    popup.style.transform = "translate3d(0,0,0)";
  }

  attachHandlers({ onBgClick, onCloseClick, onTouchMove, onTouchEnd }) {
    this.el.bg.onclick = onBgClick || null;
    if (this.el.closeBtn) this.el.closeBtn.onclick = onCloseClick || null;
    this.el.bg.ontouchmove = onTouchMove || null;
    this.el.bg.ontouchend = onTouchEnd || null;
    this.el.thumb.ontouchmove = onTouchMove || null;
    this.el.thumb.ontouchend = onTouchEnd || null;
  }

  lockBody(lock) {
    const body = document.body;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    if (lock) {
      this.bodyLockState = {
        overflow: body.style.overflow,
        paddingRight: body.style.paddingRight,
      };

      body.style.overflow = "hidden";

      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
      }

      return;
    }

    body.style.overflow = this.bodyLockState.overflow;
    body.style.paddingRight = this.bodyLockState.paddingRight;
  }

  remove() {
    this.el.box?.remove();
    this.el = {
      box: null,
      bg: null,
      popup: null,
      thumb: null,
      closeBtn: null,
      confirmWrap: null,
    };
  }

  showCloseConfirm({ title, onSaveAndClose, onClose, onCancel }) {
    if (this.el.confirmWrap?.isConnected) return;
    this.el.confirmWrap = null;

    const popupZIndex = Number.parseInt(window.getComputedStyle(this.el.popup).zIndex, 10);
    const confirmZIndex = Number.isNaN(popupZIndex) ? 106 : popupZIndex + 1;

    const wrap = this.dom.createElement({
      classList: ["fly-popup__close-confirm"],
      styles: { zIndex: confirmZIndex },
      children: [{ classList: ["fly-popup__close-confirm-background"] }],
    });
    this.dom.setStyles(wrap.firstElementChild, { zIndex: confirmZIndex });

    const content = this.dom.createElement({
      classList: ["fly-popup__close-confirm-content"],
      styles: { zIndex: confirmZIndex + 1 },
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

    const rect = content.getBoundingClientRect();
    const y = window.scrollY + window.innerHeight / 2 - rect.height / 2;
    this.dom.setStyles(content, { top: `${y}px` });

    wrap.onclick = (event) => {
      if (
        event.target === wrap ||
        event.target.classList.contains("fly-popup__close-confirm-background")
      ) {
        this.hideCloseConfirm();
      }
    };

    this.el.confirmWrap = wrap;
  }

  hideCloseConfirm() {
    this.el.confirmWrap?.remove();
    this.el.confirmWrap = null;
  }
}
