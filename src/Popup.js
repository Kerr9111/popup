import PopupModel from "./PopupModel.js";
import PopupPresenter from "./PopupPresenter.js";
import PopupView from "./PopupView.js";

export default class Popup extends PopupPresenter {
  constructor(options = {}) {
    super(new PopupModel(options), new PopupView());
  }

  static create(options = {}) {
    const popup = new this(options);
    popup.showPopup();
    return popup;
  }
}
