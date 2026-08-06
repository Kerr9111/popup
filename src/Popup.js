import PopupPresenter from "./PopupPresenter.js";

export default class Popup extends PopupPresenter {
  static create(options = {}) {
    const popup = new Popup();
    if (options.content) popup.setContent(options.content);
    popup.showPopup(options);
    return popup;
  }
}

export const activePopups = PopupPresenter.activePopups;
