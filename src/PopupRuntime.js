const RUNTIME_KEY = Symbol.for("@vecdev/popup/runtime/v1");
const RUNTIME_VERSION = 1;
const AUTO_Z_INDEX_BASE = 1300;
const AUTO_Z_INDEX_STEP = 2;

function createRuntime() {
  return {
    version: RUNTIME_VERSION,
    stack: [],
    records: new Map(),
    sequence: 0,
    bodyLockOwners: new Set(),
    bodyLockSnapshot: null,
    keydownHandler: null,
    resizeHandler: null,
    visualViewportTarget: null,
    viewportState: null,
  };
}

export function getPopupRuntime() {
  const current = globalThis[RUNTIME_KEY];
  if (current?.version === RUNTIME_VERSION) return current;

  const runtime = createRuntime();
  Object.defineProperty(globalThis, RUNTIME_KEY, {
    configurable: true,
    value: runtime,
  });
  return runtime;
}

function getWindow() {
  return typeof window === "undefined" ? null : window;
}

function getDocument() {
  return typeof document === "undefined" ? null : document;
}

function readViewport() {
  const win = getWindow();
  if (!win) return null;

  const viewport = win.visualViewport;
  if (viewport) {
    return {
      width: viewport.width,
      height: viewport.height,
      offsetTop: viewport.offsetTop,
      offsetLeft: viewport.offsetLeft,
    };
  }

  return {
    width: win.innerWidth,
    height: win.innerHeight,
    offsetTop: 0,
    offsetLeft: 0,
  };
}

export function getTopmostPopup(runtime = getPopupRuntime()) {
  let topmost = null;
  let topmostRecord = null;

  for (const popup of runtime.stack) {
    const record = runtime.records.get(popup);
    if (!record) continue;
    if (
      !topmostRecord ||
      record.zIndex > topmostRecord.zIndex ||
      (record.zIndex === topmostRecord.zIndex && record.order > topmostRecord.order)
    ) {
      topmost = popup;
      topmostRecord = record;
    }
  }

  return topmost;
}

export function notifyViewportChange(runtime = getPopupRuntime()) {
  const viewport = readViewport();
  if (!viewport) return;

  runtime.viewportState = viewport;
  for (const popup of [...runtime.stack]) {
    popup?._handleRuntimeViewportChange?.(viewport);
  }
}

function ensureGlobalListeners(runtime) {
  const doc = getDocument();
  const win = getWindow();
  if (!doc || !win) return;

  if (!runtime.keydownHandler) {
    runtime.keydownHandler = (event) => {
      if (event.key !== "Escape") return;
      getTopmostPopup(runtime)?._handleGlobalEscape?.(event);
    };
    doc.addEventListener("keydown", runtime.keydownHandler);
  }

  if (!runtime.resizeHandler) {
    runtime.resizeHandler = () => notifyViewportChange(runtime);
    win.addEventListener("resize", runtime.resizeHandler);
  }

  const viewport = win.visualViewport || null;
  if (runtime.visualViewportTarget !== viewport) {
    if (runtime.visualViewportTarget && runtime.resizeHandler) {
      runtime.visualViewportTarget.removeEventListener("resize", runtime.resizeHandler);
      runtime.visualViewportTarget.removeEventListener("scroll", runtime.resizeHandler);
    }
    runtime.visualViewportTarget = viewport;
    if (viewport && runtime.resizeHandler) {
      viewport.addEventListener("resize", runtime.resizeHandler);
      viewport.addEventListener("scroll", runtime.resizeHandler);
    }
  }

  notifyViewportChange(runtime);
}

function removeGlobalListeners(runtime) {
  const doc = getDocument();
  const win = getWindow();

  if (runtime.keydownHandler && doc) {
    doc.removeEventListener("keydown", runtime.keydownHandler);
  }
  if (runtime.resizeHandler && win) {
    win.removeEventListener("resize", runtime.resizeHandler);
  }
  if (runtime.visualViewportTarget && runtime.resizeHandler) {
    runtime.visualViewportTarget.removeEventListener("resize", runtime.resizeHandler);
    runtime.visualViewportTarget.removeEventListener("scroll", runtime.resizeHandler);
  }

  runtime.keydownHandler = null;
  runtime.resizeHandler = null;
  runtime.visualViewportTarget = null;
  runtime.viewportState = null;
}

export function registerPopup(popup, explicitZIndex, runtime = getPopupRuntime()) {
  const existing = runtime.records.get(popup);
  if (existing) return existing.zIndex;

  const order = ++runtime.sequence;
  const zIndex = Number.isFinite(explicitZIndex)
    ? explicitZIndex
    : AUTO_Z_INDEX_BASE + (order - 1) * AUTO_Z_INDEX_STEP;

  runtime.stack.push(popup);
  runtime.records.set(popup, { order, zIndex });
  ensureGlobalListeners(runtime);
  return zIndex;
}

export function updatePopupZIndex(popup, explicitZIndex, runtime = getPopupRuntime()) {
  const record = runtime.records.get(popup);
  if (!record) return null;

  record.zIndex = Number.isFinite(explicitZIndex)
    ? explicitZIndex
    : AUTO_Z_INDEX_BASE + (record.order - 1) * AUTO_Z_INDEX_STEP;
  return record.zIndex;
}

export function unregisterPopup(popup, runtime = getPopupRuntime()) {
  const index = runtime.stack.indexOf(popup);
  if (index !== -1) runtime.stack.splice(index, 1);
  runtime.records.delete(popup);

  if (runtime.stack.length === 0) {
    removeGlobalListeners(runtime);
    runtime.sequence = 0;
  }
}

export function acquireBodyLock(owner, runtime = getPopupRuntime()) {
  if (runtime.bodyLockOwners.has(owner)) return;

  const doc = getDocument();
  const win = getWindow();
  const body = doc?.body;
  if (!body || !win) return;

  if (runtime.bodyLockOwners.size === 0) {
    const computedPadding = Number.parseFloat(win.getComputedStyle(body).paddingRight) || 0;
    const scrollbarWidth = Math.max(0, win.innerWidth - doc.documentElement.clientWidth);

    runtime.bodyLockSnapshot = {
      body,
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
    };

    runtime.bodyLockOwners.add(owner);
    try {
      body.style.overflow = "hidden";
      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${computedPadding + scrollbarWidth}px`;
      }
    } catch (error) {
      runtime.bodyLockOwners.delete(owner);
      try {
        body.style.overflow = runtime.bodyLockSnapshot.overflow;
        body.style.paddingRight = runtime.bodyLockSnapshot.paddingRight;
      } catch {}
      runtime.bodyLockSnapshot = null;
      throw error;
    }
    return;
  }

  runtime.bodyLockOwners.add(owner);
}

export function releaseBodyLock(owner, runtime = getPopupRuntime()) {
  if (!runtime.bodyLockOwners.delete(owner)) return;
  if (runtime.bodyLockOwners.size > 0) return;

  const snapshot = runtime.bodyLockSnapshot;
  runtime.bodyLockSnapshot = null;
  if (!snapshot?.body) return;

  let restoreError = null;
  try {
    snapshot.body.style.overflow = snapshot.overflow;
  } catch (error) {
    restoreError = error;
  }
  try {
    snapshot.body.style.paddingRight = snapshot.paddingRight;
  } catch (error) {
    restoreError ||= error;
  }
  if (restoreError) throw restoreError;
}
