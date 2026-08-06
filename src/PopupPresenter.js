import PopupModel from "./PopupModel.js";
import PopupView from "./PopupView.js";

const CLOSE_ICON_SYMBOL = `
  <svg aria-hidden="true" width="0" height="0" style="position:absolute;overflow:hidden">
    <symbol id="close" viewBox="0 0 50 50">
      <path d="M25 30.2308L14.3007 40.9301C13.5874 41.6434 12.7156 42 11.6853 42C10.655 42 9.78322 41.6434 9.06993 40.9301C8.35664 40.2168 8 39.345 8 38.3147C8 37.2844 8.35664 36.4126 9.06993 35.6993L19.7692 25L9.06993 14.3007C8.35664 13.5874 8 12.7156 8 11.6853C8 10.655 8.35664 9.78322 9.06993 9.06993C9.78322 8.35664 10.655 8 11.6853 8C12.7156 8 13.5874 8.35664 14.3007 9.06993L25 19.7692L35.6993 9.06993C36.4126 8.35664 37.2844 8 38.3147 8C39.345 8 40.2168 8.35664 40.9301 9.06993C41.6434 9.78322 42 10.655 42 11.6853C42 12.7156 41.6434 13.5874 40.9301 14.3007L30.2308 25L40.9301 35.6993C41.6434 36.4126 42 37.2844 42 38.3147C42 39.345 41.6434 40.2168 40.9301 40.9301C40.2168 41.6434 39.345 42 38.3147 42C37.2844 42 36.4126 41.6434 35.6993 40.9301L25 30.2308Z"/>
    </symbol>
  </svg>
`;

export default class PopupPresenter {
  static activePopups = [];
  static zBase = 1000;
  static zStep = 2;

  constructor() {
    this.model = new PopupModel();
    this.view = new PopupView();
    this._keyUnsub = null;

    this.onTouchMove = this.onTouchMove.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);
  }

  setContent(content) {
    this.model.setContent(content);
    if (this.view.el.popup) this.view.mountContent(content);
  }

  setCloseBtnIcon(icon) {
    const text = typeof icon === "string" ? icon.trim() : "";
    const html = text
      ? `${CLOSE_ICON_SYMBOL}<svg width="50" height="50"><use href="#close"></use></svg> ${text}`
      : "";

    this.view.setCloseBtnIcon(html);
    if (this.view.el.closeBtn) this.view.el.closeBtn.innerHTML = html;
  }

  showPopup(options = {}) {
    PopupPresenter.activePopups.push(this);

    this.model.setOptions(options);
    this.model.setResponsiveOptions(window.innerWidth);

    const idx = PopupPresenter.activePopups.length - 1;
    const zPopup = PopupPresenter.zBase + idx * PopupPresenter.zStep + 1;
    const zBg = zPopup - 1;
    this.model.setOptions({
      styles: { popup: { zIndex: zPopup }, bg: { zIndex: zBg } },
    });

    const { styles, swipe, data, closeConfirm, lockClose } = this.model.options;

    this.view.createSkeleton(styles);

    const onKey = (event) => {
      if (event.key === "Escape") this.tryClose(this.model.options.closeConfirm);
    };
    document.addEventListener("keydown", onKey);
    this._keyUnsub = () => document.removeEventListener("keydown", onKey);

    this.view.lockBody(true);

    if (swipe?.direction === "rightToLeft") {
      const text = data?.closeBtnText ? data.closeBtnText : "";
      this.setCloseBtnIcon(text);
    } else {
      this.setCloseBtnIcon("");
    }

    const { content } = this.model.state;
    if (content) this.view.mountContent(content);

    this.view.applyDirection(swipe?.direction);

    this.model.setLockClose(lockClose === true);
    this.view.attachHandlers({
      onBgClick: () => this.tryClose(closeConfirm),
      onCloseClick: () => this.tryClose(closeConfirm),
      onTouchMove: (event) => this.onTouchMove(event, swipe),
      onTouchEnd: (event) => this.onTouchEnd(event, swipe, closeConfirm),
    });

    if (swipe?.timeout) this.view.animateIn(swipe.timeout);

    this.model.setOnClose(options?.callback || null);
    this.model.state.isOpen = true;
  }

  closePopup(closeConfirmOption = null) {
    this.tryClose(closeConfirmOption);
  }

  tryClose(confirmOpt) {
    if (!this.model.state.isOpen) return;
    if (this.model.state.lockClose === true) return;

    const hasConfirm = !!(
      confirmOpt?.close ||
      confirmOpt?.cancel ||
      confirmOpt?.saveAndClose
    );
    if (!hasConfirm) return this.forceRemove();

    this.view.showCloseConfirm({
      title: confirmOpt?.title || "",
      onSaveAndClose: confirmOpt?.saveAndClose
        ? () => {
            this.view.hideCloseConfirm();
            this.forceRemove();
          }
        : null,
      onClose: confirmOpt?.close
        ? () => {
            this.view.hideCloseConfirm();
            this.forceRemove();
          }
        : null,
      onCancel: confirmOpt?.cancel ? () => this.view.hideCloseConfirm() : null,
    });
  }

  forceRemove() {
    const callback = this.model.state.onCloseCallback;
    if (callback) callback();

    this.view.remove();
    this._keyUnsub?.();
    this.model.state.isOpen = false;

    PopupPresenter.activePopups = PopupPresenter.activePopups.filter(
      (popup) => popup !== this,
    );
    if (PopupPresenter.activePopups.length === 0) this.view.lockBody(false);
  }

  onTouchMove(event, swipe) {
    if (!swipe?.direction) return;
    if (!["bottomToTop", "topToBottom"].includes(swipe.direction)) return;

    const touch = event.touches[0] || event.changedTouches[0];
    if (this.model.state.startY === 0) this.model.setStartY(touch.clientY);

    const deltaY = touch.clientY - this.model.state.startY;
    const percent = (deltaY * 100) / window.screen.height;

    this.view.el.popup.style.transition = "";
    this.view.el.bg.style.transition = "";
    this.view.applySwipeFrame(swipe.direction, percent);
  }

  onTouchEnd(event, swipe, closeConfirm) {
    if (!swipe?.direction) return;

    const touch = event.touches?.[0] || event.changedTouches?.[0];
    if (!touch) return;
    if (this.model.state.startY === 0) this.model.setStartY(touch.clientY);

    const deltaY = touch.clientY - this.model.state.startY;
    const percent = (deltaY * 100) / window.screen.height;
    const timeout = swipe.timeout || 300;

    if (this.model.state.lockClose === true) {
      this.view.resetSwipeFrame(timeout);
      this.model.resetStartY();
      return;
    }

    let allowClose = false;
    switch (swipe.direction) {
      case "bottomToTop":
        if (percent > 10) allowClose = true;
        break;
      case "topToBottom":
        if (percent < -10) allowClose = true;
        break;
      default:
        break;
    }

    if (allowClose) this.tryClose(closeConfirm);
    else this.view.resetSwipeFrame(timeout);

    this.model.resetStartY();
  }

  setSmartPopup(options = {}) {
    const defaults = {
      title: "Save changes?",
      description: "",
      btns: [
        {
          tag: "button",
          classList: ["ui__btn", "ui__btn_red"],
          props: { textContent: "No" },
          events: { click: () => this.closePopup() },
        },
      ],
    };
    const opts = { ...defaults, ...options };
    const content = document.createElement("div");
    content.className = "vd__popup__confirm-content";
    content.innerHTML = `
      <div class="vd__popup__confirm-content__title">${opts.title}</div>
      <div class="vd__popup__confirm-content__description">${opts.description}</div>
      <div class="vd__popup__confirm-content__footer"></div>
    `;
    const footer = content.querySelector(".vd__popup__confirm-content__footer");
    opts.btns.forEach((btn) => {
      const el = document.createElement(btn.tag || "button");
      (btn.classList || []).forEach((className) => el.classList.add(className));
      if (btn.props?.textContent) el.textContent = btn.props.textContent;
      if (btn.events?.click) el.addEventListener("click", btn.events.click);
      footer.appendChild(el);
    });

    return content;
  }
}
