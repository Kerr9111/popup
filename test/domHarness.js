class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }

  removeEventListener(type, callback) {
    this.listeners.get(type)?.delete(callback);
  }

  dispatchEvent(event) {
    if (!event.target) event.target = this;
    event.currentTarget = this;
    for (const callback of [...(this.listeners.get(event.type) || [])]) callback(event);
    this[`on${event.type}`]?.(event);
    return !event.defaultPrevented;
  }
}

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...classNames) {
    classNames.forEach((className) => this.values.add(className));
  }

  remove(...classNames) {
    classNames.forEach((className) => this.values.delete(className));
  }

  contains(className) {
    return this.values.has(className);
  }

  toggle(className, force) {
    const enabled = force === undefined ? !this.contains(className) : Boolean(force);
    if (enabled) this.add(className);
    else this.remove(className);
    return enabled;
  }
}

class FakeStyle {
  constructor() {
    this.overflow = "";
    this.paddingRight = "";
  }

  setProperty(name, value) {
    this[name] = String(value);
  }

  getPropertyValue(name) {
    return this[name] || "";
  }

  removeProperty(name) {
    const previous = this.getPropertyValue(name);
    delete this[name];
    return previous;
  }
}

export class FakeElement extends FakeEventTarget {
  constructor(tag = "div") {
    super();
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.classList = new FakeClassList();
    this.style = new FakeStyle();
    this.attributes = new Map();
    this.textContent = "";
    this.type = "";
    this.clientWidth = 400;
    this.clientHeight = 600;
    this._innerHTML = "";
    this._capturedPointerId = null;
  }

  set className(value) {
    this.classList = new FakeClassList();
    String(value).split(/\s+/).filter(Boolean).forEach((item) => this.classList.add(item));
  }

  get className() {
    return [...this.classList.values].join(" ");
  }

  set innerHTML(value) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this._innerHTML = String(value);
  }

  get innerHTML() {
    return this._innerHTML;
  }

  get firstElementChild() {
    return this.children[0] || null;
  }

  get isConnected() {
    let node = this;
    while (node) {
      if (node._documentRoot) return true;
      node = node.parentNode;
    }
    return false;
  }

  appendChild(child) {
    child.remove();
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }

  prepend(child) {
    child.remove();
    child.parentNode = this;
    this.children.unshift(child);
  }

  remove() {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index !== -1) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  querySelector(selector) {
    const matches = (element) => {
      if (selector.startsWith(".")) return element.classList.contains(selector.slice(1));
      return element.tagName.toLowerCase() === selector.toLowerCase();
    };
    const queue = [...this.children];
    while (queue.length) {
      const element = queue.shift();
      if (matches(element)) return element;
      queue.push(...element.children);
    }
    return null;
  }

  getBoundingClientRect() {
    return {
      width: this.clientWidth,
      height: this.clientHeight,
      top: 0,
      left: 0,
      right: this.clientWidth,
      bottom: this.clientHeight,
    };
  }

  setPointerCapture(pointerId) {
    this._capturedPointerId = pointerId;
  }

  releasePointerCapture(pointerId) {
    if (this._capturedPointerId === pointerId) this._capturedPointerId = null;
  }
}

class FakeDocument extends FakeEventTarget {
  constructor() {
    super();
    this.body = new FakeElement("body");
    this.body._documentRoot = true;
    this.documentElement = { clientWidth: 1000 };
  }

  createElement(tag) {
    return new FakeElement(tag);
  }

  createElementNS(_namespace, tag) {
    return new FakeElement(tag);
  }
}

class FakeVisualViewport extends FakeEventTarget {
  constructor(values) {
    super();
    Object.assign(this, values);
  }
}

class FakeWindow extends FakeEventTarget {
  constructor(document, visualViewport) {
    super();
    this.document = document;
    this.innerWidth = 1024;
    this.innerHeight = 768;
    this.scrollY = 0;
    this.PointerEvent = class PointerEvent {};
    this.visualViewport = visualViewport ? new FakeVisualViewport(visualViewport) : null;
    this._frameId = 0;
    this._frames = new Map();
  }

  getComputedStyle(element) {
    return {
      paddingRight: element._computedPaddingRight || element.style.paddingRight || "0px",
      zIndex: element.style.zIndex || "auto",
    };
  }

  requestAnimationFrame(callback) {
    const id = ++this._frameId;
    this._frames.set(id, callback);
    return id;
  }

  cancelAnimationFrame(id) {
    this._frames.delete(id);
  }

  flushAnimationFrames() {
    const frames = [...this._frames.values()];
    this._frames.clear();
    frames.forEach((callback) => callback(0));
  }
}

export function installDom(options = {}) {
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
  };
  const document = new FakeDocument();
  const window = new FakeWindow(document, options.visualViewport);
  globalThis.window = window;
  globalThis.document = document;
  globalThis.HTMLElement = FakeElement;

  return {
    window,
    document,
    restore() {
      globalThis.window = previous.window;
      globalThis.document = previous.document;
      globalThis.HTMLElement = previous.HTMLElement;
    },
  };
}

export function event(type, values = {}) {
  return {
    type,
    timeStamp: 0,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    ...values,
  };
}
