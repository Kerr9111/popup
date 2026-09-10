export default class PopupModel {
  constructor() {
    this.state = {
      lifecycle: "idle",
      isOpen: false,
      content: null,
      startX: null,
      startY: null,
      activePointerId: null,
      onCloseCallback: null,
      onClose: null,
      lockClose: false,
    };

    this.baseOptions = {
      swipe: { direction: "", timeout: 300 },
      styles: { popup: {}, bg: {} },
      data: {},
      responsive: null,
      showCloseBtn: true,
      zIndex: null,
      closeOnEscape: true,
      closeOnBackdrop: true,
      scrollLock: true,
      closeConfirm: {
        title: "",
        close: false,
        saveAndClose: false,
        cancel: false,
      },
    };
    this.options = deepMerge({}, this.baseOptions);
  }

  setContent(content) {
    this.state.content = content;
  }

  setOptions(partial) {
    const persistent = { ...(partial || {}) };
    delete persistent.callback;
    delete persistent.onOpen;
    delete persistent.onClose;
    this.baseOptions = deepMerge(this.baseOptions, persistent);
    this.options = deepMerge({}, this.baseOptions);
  }

  setResponsiveOptions(screenWidth) {
    const responsive = this.baseOptions.responsive;
    let effective = deepMerge({}, this.baseOptions);
    if (!responsive) {
      this.options = effective;
      return;
    }

    const sortedBreakpoints = Object.keys(responsive)
      .map((key) => parseInt(key, 10))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);

    for (const breakpoint of sortedBreakpoints) {
      if (screenWidth >= breakpoint) {
        effective = deepMerge(effective, responsive[breakpoint] || {});
      }
    }

    this.options = effective;
  }

  setOnClose(callback, onClose) {
    this.state.onCloseCallback = typeof callback === "function" ? callback : null;
    this.state.onClose = typeof onClose === "function" ? onClose : null;
  }

  takeOnCloseCallbacks() {
    const callbacks = [this.state.onCloseCallback, this.state.onClose].filter(
      (callback, index, list) => typeof callback === "function" && list.indexOf(callback) === index,
    );
    this.state.onCloseCallback = null;
    this.state.onClose = null;
    return callbacks;
  }

  setLockClose(lock) {
    this.state.lockClose = Boolean(lock);
  }

  setStartY(y) {
    this.state.startY = y;
  }

  setStartX(x) {
    this.state.startX = x;
  }

  resetTouchStart() {
    this.state.startX = null;
    this.state.startY = null;
    this.state.activePointerId = null;
  }

  setActivePointerId(pointerId) {
    this.state.activePointerId = pointerId;
  }
}

function isPlainObject(value) {
  if (!value || Object.prototype.toString.call(value) !== "[object Object]") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepMerge(base, patch) {
  const out = { ...base };

  for (const key of Object.keys(patch)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    if (isPlainObject(patch[key]) && isPlainObject(base[key])) {
      out[key] = deepMerge(base[key], patch[key]);
    } else {
      out[key] = patch[key];
    }
  }

  return out;
}
