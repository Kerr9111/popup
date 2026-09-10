export const POPUP_DIRECTIONS = [
  "center",
  "leftToRight",
  "rightToLeft",
  "topToBottom",
  "bottomToTop",
];

const SIZE_OPTIONS = ["width", "maxWidth", "height", "maxHeight"];
const BOOLEAN_OPTIONS = [
  "showCloseButton",
  "closeOnEscape",
  "closeOnBackdrop",
  "scrollLock",
];
const OPTION_KEYS = new Set([
  "content",
  "direction",
  "timeout",
  ...SIZE_OPTIONS,
  "zIndex",
  ...BOOLEAN_OPTIONS,
  "closeButtonLabel",
  "beforeClose",
  "onOpen",
  "onClose",
  "responsive",
]);
const RESPONSIVE_OPTION_KEYS = new Set([
  "direction",
  "timeout",
  ...SIZE_OPTIONS,
  "zIndex",
  ...BOOLEAN_OPTIONS,
  "closeButtonLabel",
]);

function createDefaultOptions() {
  return {
    direction: "center",
    timeout: 300,
    width: null,
    maxWidth: null,
    height: null,
    maxHeight: null,
    zIndex: null,
    showCloseButton: true,
    closeButtonLabel: "Close",
    closeOnEscape: true,
    closeOnBackdrop: true,
    scrollLock: true,
    beforeClose: null,
    onOpen: null,
    onClose: null,
    responsive: null,
  };
}

export default class PopupModel {
  constructor(options = {}) {
    this.state = {
      lifecycle: "idle",
      content: null,
      pointerId: null,
      startX: null,
      startY: null,
      startTime: null,
    };
    this.baseOptions = createDefaultOptions();
    this.options = deepMerge({}, this.baseOptions);

    if (Object.prototype.hasOwnProperty.call(options, "content")) {
      this.setContent(options.content);
    }
    this.configure(options);
  }

  configure(partial = {}) {
    this.assertUsable();
    validateOptionKeys(partial, OPTION_KEYS, "Popup");
    const persistent = { ...partial };
    delete persistent.content;
    this.baseOptions = deepMerge(this.baseOptions, persistent);
    validateOptions(this.baseOptions);
    this.options = deepMerge({}, this.baseOptions);
  }

  resolveResponsive(screenWidth) {
    this.assertUsable();
    const responsive = this.baseOptions.responsive;
    let effective = deepMerge({}, this.baseOptions);

    if (responsive) {
      const breakpoints = Object.keys(responsive)
        .map(Number)
        .filter(Number.isFinite)
        .sort((a, b) => a - b);

      for (const breakpoint of breakpoints) {
        if (screenWidth >= breakpoint) {
          effective = deepMerge(effective, sanitizeResponsive(responsive[breakpoint]));
        }
      }
    }

    validateOptions(effective);
    this.options = effective;
    return effective;
  }

  setContent(content) {
    this.assertUsable();
    if (!content || content.nodeType !== 1) {
      throw new TypeError("Popup content must be an HTMLElement");
    }
    this.state.content = content;
  }

  startGesture(pointerId, x, y, time) {
    this.state.pointerId = pointerId;
    this.state.startX = x;
    this.state.startY = y;
    this.state.startTime = time;
  }

  resetGesture() {
    this.state.pointerId = null;
    this.state.startX = null;
    this.state.startY = null;
    this.state.startTime = null;
  }

  assertUsable() {
    if (this.state.lifecycle === "destroyed") {
      throw new Error("Popup instance has been destroyed");
    }
  }

  destroy() {
    this.resetGesture();
    this.state.content = null;
    this.state.lifecycle = "destroyed";
    this.baseOptions = null;
    this.options = null;
  }
}

function sanitizeResponsive(value) {
  if (!isPlainObject(value)) return {};
  validateOptionKeys(value, RESPONSIVE_OPTION_KEYS, "Responsive popup");
  const sanitized = { ...value };
  delete sanitized.content;
  delete sanitized.responsive;
  delete sanitized.beforeClose;
  delete sanitized.onOpen;
  delete sanitized.onClose;
  return sanitized;
}

function validateOptions(options) {
  if (!POPUP_DIRECTIONS.includes(options.direction)) {
    throw new TypeError(`Unsupported popup direction: ${String(options.direction)}`);
  }
  if (typeof options.timeout !== "number" || !Number.isFinite(options.timeout) || options.timeout < 0) {
    throw new TypeError("Popup timeout must be a non-negative finite number");
  }
  if (options.zIndex !== null && (!Number.isFinite(options.zIndex) || typeof options.zIndex !== "number")) {
    throw new TypeError("Popup zIndex must be a finite number");
  }
  for (const key of SIZE_OPTIONS) {
    if (options[key] !== null && typeof options[key] !== "string") {
      throw new TypeError(`Popup ${key} must be a CSS length string`);
    }
  }
  for (const key of BOOLEAN_OPTIONS) {
    if (typeof options[key] !== "boolean") {
      throw new TypeError(`Popup ${key} must be a boolean`);
    }
  }
  if (typeof options.closeButtonLabel !== "string") {
    throw new TypeError("Popup closeButtonLabel must be a string");
  }
  for (const key of ["beforeClose", "onOpen", "onClose"]) {
    if (options[key] !== null && typeof options[key] !== "function") {
      throw new TypeError(`Popup ${key} must be a function`);
    }
  }
  if (options.responsive !== null) {
    if (!isPlainObject(options.responsive)) {
      throw new TypeError("Popup responsive must be an object");
    }
    for (const [breakpoint, override] of Object.entries(options.responsive)) {
      if (!Number.isFinite(Number(breakpoint)) || Number(breakpoint) < 0) {
        throw new TypeError(`Invalid popup breakpoint: ${breakpoint}`);
      }
      if (!isPlainObject(override)) {
        throw new TypeError(`Popup breakpoint ${breakpoint} must contain an object`);
      }
      validateOptionKeys(override, RESPONSIVE_OPTION_KEYS, "Responsive popup");
    }
  }
}

function validateOptionKeys(options, allowedKeys, label) {
  if (!isPlainObject(options)) {
    throw new TypeError(`${label} options must be an object`);
  }
  for (const key of Object.keys(options)) {
    if (!allowedKeys.has(key)) {
      throw new TypeError(`Unsupported popup option: ${key}`);
    }
  }
}

function isPlainObject(value) {
  if (!value || Object.prototype.toString.call(value) !== "[object Object]") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepMerge(base, patch) {
  const out = { ...base };
  for (const key of Object.keys(patch || {})) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    if (isPlainObject(patch[key]) && isPlainObject(base?.[key])) {
      out[key] = deepMerge(base[key], patch[key]);
    } else {
      out[key] = patch[key];
    }
  }
  return out;
}
