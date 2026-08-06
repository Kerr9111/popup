export default class PopupModel {
  constructor() {
    this.state = {
      isOpen: false,
      content: null,
      startX: null,
      startY: null,
      onCloseCallback: null,
      lockClose: false,
    };

    this.options = {
      swipe: { direction: "", timeout: 300 },
      styles: { popup: {}, bg: {} },
      data: {},
      responsive: null,
      closeConfirm: {
        title: "",
        close: false,
        saveAndClose: false,
        cancel: false,
      },
    };
  }

  setContent(content) {
    this.state.content = content;
  }

  setOptions(partial) {
    this.options = deepMerge(this.options, partial || {});
  }

  setResponsiveOptions(screenWidth) {
    const responsive = this.options.responsive;
    if (!responsive) return;

    const sortedBreakpoints = Object.keys(responsive)
      .map((key) => parseInt(key, 10))
      .sort((a, b) => a - b);

    let picked = {};
    for (const breakpoint of sortedBreakpoints) {
      if (screenWidth >= breakpoint) picked = responsive[breakpoint];
    }

    this.setOptions(picked);
  }

  setOnClose(callback) {
    this.state.onCloseCallback = typeof callback === "function" ? callback : null;
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
  }
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, patch) {
  const out = { ...base };

  for (const key in patch) {
    if (isPlainObject(patch[key]) && isPlainObject(base[key])) {
      out[key] = deepMerge(base[key], patch[key]);
    } else {
      out[key] = patch[key];
    }
  }

  return out;
}
