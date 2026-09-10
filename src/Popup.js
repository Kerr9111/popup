import PopupModel from "./PopupModel.js";
import PopupPresenter from "./PopupPresenter.js";
import PopupView from "./PopupView.js";

export default class Popup extends PopupPresenter {
  constructor() {
    super(new PopupModel(), new PopupView());
  }

  static create(options = {}) {
    const popup = new this();
    if (Object.prototype.hasOwnProperty.call(options, "content")) {
      popup.setContent(options.content);
    }
    popup.showPopup(options);
    return popup;
  }
}

export const activePopups = PopupPresenter.activePopups;
