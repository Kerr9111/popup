import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, test } from "node:test";
import Popup, * as popupModule from "../src/index.js";
import { getPopupRuntime } from "../src/PopupRuntime.js";
import { FakeElement, event, installDom } from "./domHarness.js";

let dom;
const popupStyles = readFileSync(new URL("../styles/popup.scss", import.meta.url), "utf8");
const compiledPopupCss = readFileSync(new URL("../styles/popup.css", import.meta.url), "utf8");

beforeEach(() => {
  dom = installDom();
});

afterEach(() => {
  const runtime = getPopupRuntime();
  for (const popup of [...runtime.stack]) {
    try {
      popup.forceRemove();
    } catch {}
  }
  dom.restore();
});

function content(tag = "section") {
  return new FakeElement(tag);
}

function open(options = {}) {
  return Popup.create({ content: content(), timeout: 0, ...options });
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

test("constructor and factory expose the one-shot lifecycle", async () => {
  const popup = new Popup({ content: content(), timeout: 0 });
  assert.equal(popup.lifecycle, "idle");

  popup.showPopup();
  assert.equal(popup.lifecycle, "open");
  assert.equal(await popup.closePopup(), true);
  assert.equal(popup.lifecycle, "destroyed");
  assert.equal(popup.element, null);
  assert.throws(() => popup.showPopup(), /destroyed/);
  assert.throws(() => popup.setContent(content()), /destroyed/);
});

test("showPopup is idempotent while the instance is active", () => {
  const popup = open();
  const root = popup.element;
  popup.showPopup({ direction: "leftToRight" });
  assert.equal(popup.element, root);
  assert.equal(dom.document.body.children.length, 1);
});

test("content accepts only HTMLElement-like nodes", () => {
  assert.throws(() => new Popup({ content: "<b>unsafe</b>" }), /HTMLElement/);
  assert.throws(() => new Popup().setContent({}), /HTMLElement/);
  assert.doesNotThrow(() => new Popup({ content: content() }));
});

test("canonical DOM and accessible close button are mounted", () => {
  const popup = open({ closeButtonLabel: "Dismiss" });
  assert.equal(popup.element.className, "fly-popup fly-popup--swipe-disabled fly-popup--center");
  assert.equal(popup.element.children[0].className, "fly-popup__background");
  assert.equal(popup.panelElement.className, "fly-popup__window");
  assert.equal(popup.panelElement.getAttribute("role"), "dialog");
  assert.equal(popup.panelElement.getAttribute("aria-modal"), "true");
  assert.equal(popup.contentElement.className, "fly-popup__content");
  assert.equal(popup.view.el.thumb.parentNode, popup.panelElement);
  assert.equal(popup.view.el.gestureZone.className, "fly-popup__gesture-zone");
  assert.equal(popup.view.el.gestureZone.parentNode, popup.element);
  assert.equal(popup.view.el.closeBtn.tagName, "BUTTON");
  assert.equal(popup.view.el.closeBtn.type, "button");
  assert.equal(popup.view.el.closeBtn.getAttribute("aria-label"), "Dismiss");
});

test("setContent replaces and detaches current content", () => {
  const first = content();
  const second = content("article");
  const popup = open({ content: first });
  assert.equal(first.parentNode, popup.contentElement);

  assert.equal(popup.setContent(second), popup);
  assert.equal(first.parentNode, null);
  assert.equal(second.parentNode, popup.contentElement);
});

test("iframe content receives the dedicated full-height mode and is removed", () => {
  const iframe = content("iframe");
  const popup = open({ content: iframe, direction: "rightToLeft" });
  const wrapper = popup.contentElement;
  assert.equal(wrapper.classList.contains("fly-popup__content--iframe"), true);
  assert.equal(wrapper.onpointerdown, undefined);
  assert.equal(iframe.onpointerdown, undefined);

  popup.forceRemove();
  assert.equal(iframe.isConnected, false);
  assert.equal(popup.contentElement, null);
});

test("normal close cleans runtime and body before onClose", async () => {
  let snapshot;
  const popup = open({
    onClose: ({ popup: closed, forced }) => {
      snapshot = {
        lifecycle: closed.lifecycle,
        element: closed.element,
        stackSize: getPopupRuntime().stack.length,
        overflow: dom.document.body.style.overflow,
        forced,
      };
    },
  });

  await popup.closePopup();
  assert.deepEqual(snapshot, {
    lifecycle: "destroyed",
    element: null,
    stackSize: 0,
    overflow: "",
    forced: false,
  });
});

test("forceRemove bypasses beforeClose, is immediate and idempotent", () => {
  let beforeCalls = 0;
  let closeCalls = 0;
  const popup = open({
    beforeClose: () => {
      beforeCalls += 1;
      return false;
    },
    onClose: ({ forced }) => {
      closeCalls += 1;
      assert.equal(forced, true);
    },
  });

  popup.forceRemove();
  popup.forceRemove();
  popup.forceRemove();
  assert.equal(beforeCalls, 0);
  assert.equal(closeCalls, 1);
  assert.equal(popup.lifecycle, "destroyed");
});

test("cleanup remains complete when onClose throws", async () => {
  const popup = open({ onClose: () => { throw new Error("callback failed"); } });
  await assert.rejects(popup.closePopup(), /callback failed/);
  assert.equal(popup.lifecycle, "destroyed");
  assert.equal(popup.element, null);
  assert.equal(getPopupRuntime().stack.length, 0);
  assert.equal(dom.document.body.style.overflow, "");
});

test("forceRemove cleans before rethrowing an onClose exception", () => {
  const popup = open({ onClose: () => { throw new Error("forced callback failed"); } });
  assert.throws(() => popup.forceRemove(), /forced callback failed/);
  assert.equal(popup.lifecycle, "destroyed");
  assert.equal(getPopupRuntime().stack.length, 0);
});

test("forceRemove during opening cancels the pending animation frame", () => {
  const popup = new Popup({ content: content(), timeout: 300 });
  const animateIn = popup.view.animateIn.bind(popup.view);
  popup.view.animateIn = (timeout) => {
    animateIn(timeout);
    popup.forceRemove();
  };

  popup.showPopup();
  assert.equal(popup.lifecycle, "destroyed");
  assert.equal(dom.window._frames.size, 0);
  dom.window.flushAnimationFrames();
  assert.equal(popup.element, null);
});

test("forceRemove during closing resolves the close operation without stale DOM access", async () => {
  const popup = open({ timeout: 100 });
  const closing = popup.closePopup();
  dom.window.flushAnimationFrames();
  popup.forceRemove();
  assert.equal(await closing, true);
  assert.equal(popup.lifecycle, "destroyed");
  assert.equal(popup.element, null);
  assert.equal(popup.view._timeouts.size, 0);
  assert.equal(popup.view._animationFrames.size, 0);
});

test("forceRemove also settles a close waiting for beforeClose", async () => {
  const popup = open({ beforeClose: () => new Promise(() => {}) });
  const closing = popup.closePopup();
  popup.forceRemove();
  assert.equal(await closing, true);
  assert.equal(popup.lifecycle, "destroyed");
});

test("beforeClose supports sync true and false", async () => {
  const allowed = open({ beforeClose: () => true });
  assert.equal(await allowed.closePopup(), true);
  assert.equal(allowed.lifecycle, "destroyed");

  const denied = open({ beforeClose: () => false });
  assert.equal(await denied.closePopup(), false);
  assert.equal(denied.lifecycle, "open");
});

test("beforeClose supports async true and false", async () => {
  const allowed = open({ beforeClose: async () => true });
  assert.equal(await allowed.closePopup(), true);

  const denied = open({ beforeClose: async () => false });
  assert.equal(await denied.closePopup(), false);
  assert.equal(denied.lifecycle, "open");
});

test("beforeClose rejection restores open state", async () => {
  const popup = open({ beforeClose: async () => { throw new Error("no decision"); } });
  await assert.rejects(popup.closePopup(), /no decision/);
  assert.equal(popup.lifecycle, "open");
  assert.equal(popup.isOpen, true);
});

test("concurrent closePopup calls share one close operation", async () => {
  let resolve;
  const decision = new Promise((done) => { resolve = done; });
  const popup = open({ beforeClose: () => decision });
  const first = popup.closePopup();
  const second = popup.closePopup();
  assert.equal(first, second);
  resolve(true);
  assert.equal(await first, true);
});

test("timeout zero reaches final open and close states", async () => {
  const popup = open({ direction: "bottomToTop" });
  assert.equal(popup.panelElement.style.transition, "none");
  assert.equal(popup.panelElement.style.transform, "translate3d(0,0,0)");
  assert.equal(await popup.closePopup(), true);
  assert.equal(popup.lifecycle, "destroyed");
});

test("all direction modifiers are stable and close in the reverse direction", async () => {
  const cases = [
    ["center", "fly-popup--center", "scale(0.98)"],
    ["bottomToTop", "fly-popup--bottom-to-top", "translate3d(0,100%,0)"],
    ["topToBottom", "fly-popup--top-to-bottom", "translate3d(0,-100%,0)"],
    ["leftToRight", "fly-popup--left-to-right", "translate3d(-100%,0,0)"],
    ["rightToLeft", "fly-popup--right-to-left", "translate3d(100%,0,0)"],
  ];

  for (const [direction, modifier, closedTransform] of cases) {
    let panel;
    const popup = open({
      direction,
      onClose: () => {
        assert.equal(panel.style.transform, closedTransform);
      },
    });
    panel = popup.panelElement;
    assert.equal(popup.element.classList.contains(modifier), true);
    await popup.closePopup();
  }
});

test("invalid direction, duration and size values fail early", () => {
  assert.throws(() => new Popup({ direction: "sideways" }), /direction/);
  assert.throws(() => new Popup({ timeout: -1 }), /timeout/);
  assert.throws(() => new Popup({ width: 320 }), /width/);
  assert.throws(() => new Popup({ zIndex: Infinity }), /zIndex/);
  assert.throws(() => new Popup({ swipe: { direction: "leftToRight" } }), /Unsupported/);
  assert.throws(() => new Popup({ responsive: { mobile: {} } }), /breakpoint/);
});

test("sizing and z-index options are exposed on the root", () => {
  const popup = open({
    width: "420px",
    maxWidth: "90%",
    height: "70vh",
    maxHeight: "680px",
    zIndex: 9000,
  });
  assert.equal(popup.element.style.getPropertyValue("--popup-width"), "420px");
  assert.equal(popup.element.style.getPropertyValue("--popup-max-width"), "90%");
  assert.equal(popup.element.style.getPropertyValue("--popup-height"), "70vh");
  assert.equal(popup.element.style.getPropertyValue("--popup-max-height"), "680px");
  assert.equal(popup.element.style.zIndex, "9000");
  assert.equal(popup.element.style.getPropertyValue("--popup-z-index"), "9000");
});

test("opening waits for an initial painted frame and uses the configured duration", () => {
  const popup = Popup.create({ content: content(), direction: "bottomToTop", timeout: 500 });
  assert.equal(popup.panelElement.style.transition, "transform 500ms, opacity 500ms");
  assert.equal(popup.panelElement.style.transform, "");

  dom.window.flushAnimationFrames();
  assert.equal(popup.panelElement.style.transform, "");

  dom.window.flushAnimationFrames();
  assert.equal(popup.panelElement.style.transform, "translate3d(0,0,0)");
});

test("slide layouts retain configurable viewport edge gaps", () => {
  assert.match(popupStyles, /--popup-edge-gap-vertical: 32px/);
  assert.match(popupStyles, /--popup-edge-gap-horizontal: 12px/);
  assert.match(
    popupStyles,
    /&--bottom-to-top\s*\{[\s\S]*?max-height: min\([\s\S]*?--popup-edge-gap-vertical/,
  );
  assert.match(
    popupStyles,
    /&--top-to-bottom\s*\{[\s\S]*?max-height: min\([\s\S]*?--popup-edge-gap-vertical/,
  );
  assert.match(
    popupStyles,
    /&--left-to-right\s*\{[\s\S]*?max-width: min\([\s\S]*?--popup-edge-gap-horizontal/,
  );
  assert.match(
    popupStyles,
    /&--right-to-left\s*\{[\s\S]*?max-width: min\([\s\S]*?--popup-edge-gap-horizontal/,
  );
  assert.match(popupStyles, /calc\(100% - var\(--popup-edge-gap-vertical\)\)/);
  assert.match(popupStyles, /calc\(100% - var\(--popup-edge-gap-horizontal\)\)/);
  assert.match(compiledPopupCss, /--popup-edge-gap-vertical: 32px/);
  assert.match(compiledPopupCss, /--popup-edge-gap-horizontal: 12px/);
  assert.match(compiledPopupCss, /calc\(100% - var\(--popup-edge-gap-vertical\)\)/);
  assert.match(compiledPopupCss, /calc\(100% - var\(--popup-edge-gap-horizontal\)\)/);
  assert.match(popupStyles, /--popup-close-color:\s*#3b82f6/);
  assert.match(popupStyles, /color:\s*var\(--popup-close-color\)/);
  assert.match(compiledPopupCss, /--popup-close-color:\s*#3b82f6/);
  assert.match(compiledPopupCss, /color:\s*var\(--popup-close-color\)/);
});

test("gesture zone follows each directional edge gap", () => {
  assert.match(
    popupStyles,
    /&--bottom-to-top\s*{[\s\S]*?\.fly-popup__gesture-zone\s*{\s*display:\s*block;\s*top:\s*0;\s*left:\s*0;\s*width:\s*100%;\s*height:\s*var\(--popup-edge-gap-vertical\)/,
  );
  assert.match(
    popupStyles,
    /&--top-to-bottom\s*{[\s\S]*?\.fly-popup__gesture-zone\s*{\s*display:\s*block;\s*bottom:\s*0;\s*left:\s*0;\s*width:\s*100%;\s*height:\s*var\(--popup-edge-gap-vertical\)/,
  );
  assert.match(
    popupStyles,
    /&--left-to-right\s*{[\s\S]*?\.fly-popup__gesture-zone\s*{\s*display:\s*block;\s*top:\s*0;\s*right:\s*0;\s*width:\s*var\(--popup-edge-gap-horizontal\);\s*height:\s*100%/,
  );
  assert.match(
    popupStyles,
    /&--right-to-left\s*{[\s\S]*?\.fly-popup__gesture-zone\s*{\s*display:\s*block;\s*top:\s*0;\s*left:\s*0;\s*width:\s*var\(--popup-edge-gap-horizontal\);\s*height:\s*100%/,
  );
});

test("stack has unique automatic z-index and supports closing A first", async () => {
  const first = open();
  const second = open();
  assert.notEqual(first.element.style.zIndex, second.element.style.zIndex);
  assert.equal(getPopupRuntime().stack.length, 2);

  await first.closePopup();
  assert.equal(first.lifecycle, "destroyed");
  assert.equal(second.lifecycle, "open");
  assert.equal(dom.document.body.style.overflow, "hidden");

  await second.closePopup();
  assert.equal(dom.document.body.style.overflow, "");
});

test("stack supports closing B first and returns to A", async () => {
  const first = open();
  const second = open();
  await second.closePopup();
  assert.equal(first.lifecycle, "open");
  assert.equal(getPopupRuntime().stack[0], first);
  await first.closePopup();
});

test("Escape closes only the topmost popup", async () => {
  const first = open();
  const second = open();
  dom.document.dispatchEvent(event("keydown", { key: "Escape" }));
  await settle();
  assert.equal(second.lifecycle, "destroyed");
  assert.equal(first.lifecycle, "open");
});

test("topmost closeOnEscape false protects lower popup", async () => {
  const first = open();
  const second = open({ closeOnEscape: false });
  dom.document.dispatchEvent(event("keydown", { key: "Escape" }));
  await settle();
  assert.equal(second.lifecycle, "open");
  assert.equal(first.lifecycle, "open");
});

test("explicit z-index determines Escape topmost", async () => {
  const first = open({ zIndex: 5000 });
  const second = open({ zIndex: 4000 });
  dom.document.dispatchEvent(event("keydown", { key: "Escape" }));
  await settle();
  assert.equal(first.lifecycle, "destroyed");
  assert.equal(second.lifecycle, "open");
});

test("body lock preserves original inline state in arbitrary close order", async () => {
  dom.document.body.style.overflow = "auto";
  dom.document.body.style.paddingRight = "7px";
  dom.document.body._computedPaddingRight = "7px";
  const first = open();
  const second = open();
  assert.equal(dom.document.body.style.overflow, "hidden");
  assert.equal(dom.document.body.style.paddingRight, "31px");

  await first.closePopup();
  assert.equal(dom.document.body.style.paddingRight, "31px");
  await second.closePopup();
  assert.equal(dom.document.body.style.overflow, "auto");
  assert.equal(dom.document.body.style.paddingRight, "7px");
});

test("scrollLock false does not become a body-lock owner", async () => {
  const unlocked = open({ scrollLock: false });
  assert.equal(dom.document.body.style.overflow, "");
  const locked = open();
  assert.equal(dom.document.body.style.overflow, "hidden");
  await locked.closePopup();
  assert.equal(dom.document.body.style.overflow, "");
  await unlocked.closePopup();
});

test("backdrop closes normally but is never a swipe target", async () => {
  const popup = open({ direction: "bottomToTop" });
  assert.equal(popup.view.el.bg.onpointerdown, undefined);
  popup.view.el.bg.dispatchEvent(event("pointerdown", {
    pointerId: 1, isPrimary: true, clientX: 10, clientY: 10,
  }));
  assert.equal(popup.model.state.pointerId, null);
  popup.view.el.bg.dispatchEvent(event("click"));
  await settle();
  assert.equal(popup.lifecycle, "destroyed");

  const protectedPopup = open({ closeOnBackdrop: false });
  protectedPopup.view.el.bg.dispatchEvent(event("click"));
  await settle();
  assert.equal(protectedPopup.lifecycle, "open");
});

test("swipe is enabled by default for directional popups", () => {
  const popup = open({ direction: "bottomToTop" });
  assert.equal(popup.model.options.swipeEnabled, true);
  assert.equal(popup.element.classList.contains("fly-popup--swipe-disabled"), false);
  assert.equal(typeof popup.view.el.thumb.onpointerdown, "function");
  assert.equal(typeof popup.view.el.gestureZone.onpointerdown, "function");
});

test("swipeEnabled false hides both gesture areas and does not attach handlers", () => {
  const popup = open({ direction: "rightToLeft", swipeEnabled: false });
  const thumb = popup.view.el.thumb;
  const gestureZone = popup.view.el.gestureZone;

  assert.equal(popup.element.classList.contains("fly-popup--swipe-disabled"), true);
  assert.match(popupStyles, /&--swipe-disabled\s*{[\s\S]*?\.fly-popup__thumb,[\s\S]*?\.fly-popup__gesture-zone\s*{\s*display:\s*none/);
  assert.match(
    compiledPopupCss,
    /\.fly-popup--swipe-disabled \.fly-popup__thumb,[\s\S]*?\.fly-popup--swipe-disabled \.fly-popup__gesture-zone\s*{\s*display:\s*none/,
  );
  assert.equal(thumb.onpointerdown, null);
  assert.equal(thumb.onpointermove, null);
  assert.equal(thumb.onpointerup, null);
  assert.equal(thumb.onpointercancel, null);
  assert.equal(gestureZone.onpointerdown, null);
  assert.equal(gestureZone.onpointermove, null);
  assert.equal(gestureZone.onpointerup, null);
  assert.equal(gestureZone.onpointercancel, null);
});

test("swipeEnabled false preserves directional opening and closing states", async () => {
  let closedTransform;
  let panel;
  const popup = open({
    direction: "leftToRight",
    swipeEnabled: false,
    onClose: () => {
      closedTransform = panel.style.transform;
    },
  });
  panel = popup.panelElement;

  assert.equal(popup.element.classList.contains("fly-popup--left-to-right"), true);
  assert.equal(popup.panelElement.style.transform, "translate3d(0,0,0)");
  await popup.closePopup();
  assert.equal(closedTransform, "translate3d(-100%,0,0)");
});

test("center mode has no active swipe gesture", () => {
  const popup = open({ direction: "center", swipeEnabled: true });
  assert.equal(popup.element.classList.contains("fly-popup--swipe-disabled"), true);
  assert.equal(popup.view.el.thumb.onpointerdown, null);
  assert.equal(popup.view.el.gestureZone.onpointerdown, null);
  popup.view.el.thumb.dispatchEvent(event("pointerdown", {
    pointerId: 1,
    isPrimary: true,
    clientX: 10,
    clientY: 10,
  }));
  assert.equal(popup.model.state.pointerId, null);
});

test("non-gesture close controls keep working when swipe is disabled", async () => {
  const backdrop = open({ direction: "bottomToTop", swipeEnabled: false });
  backdrop.view.el.bg.dispatchEvent(event("click"));
  await settle();
  assert.equal(backdrop.lifecycle, "destroyed");

  const escape = open({ direction: "bottomToTop", swipeEnabled: false });
  dom.document.dispatchEvent(event("keydown", { key: "Escape" }));
  await settle();
  assert.equal(escape.lifecycle, "destroyed");

  const button = open({ direction: "bottomToTop", swipeEnabled: false });
  button.view.el.closeBtn.dispatchEvent(event("click"));
  await settle();
  assert.equal(button.lifecycle, "destroyed");
});

test("iframe and content never receive gesture handlers when swipe is disabled", () => {
  const iframe = content("iframe");
  const popup = open({ content: iframe, direction: "rightToLeft", swipeEnabled: false });
  assert.equal(popup.contentElement.onpointerdown, undefined);
  assert.equal(iframe.onpointerdown, undefined);
  assert.equal(popup.view.el.thumb.onpointerdown, null);
});

test("swipe starts from the thumb in all four directions", async () => {
  const cases = [
    ["bottomToTop", 100, 100, 100, 220],
    ["topToBottom", 100, 220, 100, 100],
    ["leftToRight", 220, 100, 100, 100],
    ["rightToLeft", 100, 100, 220, 100],
  ];

  for (const [direction, startX, startY, endX, endY] of cases) {
    const popup = open({ direction });
    const thumb = popup.view.el.thumb;
    thumb.dispatchEvent(event("pointerdown", {
      pointerId: 7,
      isPrimary: true,
      clientX: startX,
      clientY: startY,
      timeStamp: 0,
    }));
    thumb.dispatchEvent(event("pointerup", {
      pointerId: 7,
      clientX: endX,
      clientY: endY,
      timeStamp: 400,
    }));
    await settle();
    assert.equal(popup.lifecycle, "destroyed", direction);
  }
});

test("a short fast flick closes while an insufficient drag resets", async () => {
  const flick = open({ direction: "rightToLeft" });
  flick.view.el.thumb.dispatchEvent(event("pointerdown", {
    pointerId: 1, isPrimary: true, clientX: 100, clientY: 10, timeStamp: 0,
  }));
  flick.view.el.thumb.dispatchEvent(event("pointerup", {
    pointerId: 1, clientX: 120, clientY: 10, timeStamp: 20,
  }));
  await settle();
  assert.equal(flick.lifecycle, "destroyed");

  const drag = open({ direction: "rightToLeft", timeout: 100 });
  drag.view.el.thumb.dispatchEvent(event("pointerdown", {
    pointerId: 2, isPrimary: true, clientX: 100, clientY: 10, timeStamp: 0,
  }));
  drag.view.el.thumb.dispatchEvent(event("pointerup", {
    pointerId: 2, clientX: 150, clientY: 10, timeStamp: 500,
  }));
  dom.window.flushAnimationFrames();
  assert.equal(drag.lifecycle, "open");
  assert.equal(drag.panelElement.style.transform, "translate3d(0,0,0)");
});

test("opposite movement does not prevent default and resets", () => {
  const popup = open({ direction: "rightToLeft", timeout: 0 });
  const thumb = popup.view.el.thumb;
  thumb.dispatchEvent(event("pointerdown", {
    pointerId: 1, isPrimary: true, clientX: 100, clientY: 10,
  }));
  const move = event("pointermove", {
    pointerId: 1, clientX: 50, clientY: 10,
  });
  thumb.dispatchEvent(move);
  assert.equal(move.defaultPrevented, false);
  thumb.dispatchEvent(event("pointerup", {
    pointerId: 1, clientX: 50, clientY: 10, timeStamp: 100,
  }));
  assert.equal(popup.lifecycle, "open");
  assert.equal(popup.panelElement.style.transform, "translate3d(0,0,0)");
});

test("pointerId is captured and unrelated pointers are ignored", () => {
  const popup = open({ direction: "bottomToTop" });
  const thumb = popup.view.el.thumb;
  thumb.dispatchEvent(event("pointerdown", {
    pointerId: 4, isPrimary: true, clientX: 10, clientY: 10,
  }));
  assert.equal(thumb._capturedPointerId, 4);
  thumb.dispatchEvent(event("pointermove", {
    pointerId: 5, clientX: 10, clientY: 200,
  }));
  assert.equal(popup.panelElement.style.transform, "translate3d(0,0,0)");
  thumb.dispatchEvent(event("pointercancel", { pointerId: 5 }));
  assert.equal(popup.model.state.pointerId, 4);
});

test("pointercancel returns the popup to the open state", () => {
  const popup = open({ direction: "rightToLeft", timeout: 100 });
  const thumb = popup.view.el.thumb;
  thumb.dispatchEvent(event("pointerdown", {
    pointerId: 1, isPrimary: true, clientX: 100, clientY: 100,
  }));
  thumb.dispatchEvent(event("pointermove", {
    pointerId: 1, clientX: 250, clientY: 100,
  }));
  assert.notEqual(popup.panelElement.style.transform, "translate3d(0,0,0)");
  thumb.dispatchEvent(event("pointercancel", { pointerId: 1 }));
  dom.window.flushAnimationFrames();
  assert.equal(popup.lifecycle, "open");
  assert.equal(popup.panelElement.style.transform, "translate3d(0,0,0)");
});

test("only the topmost popup can start a thumb gesture", () => {
  const first = open({ direction: "rightToLeft" });
  const second = open({ direction: "bottomToTop" });
  first.view.el.thumb.dispatchEvent(event("pointerdown", {
    pointerId: 1, isPrimary: true, clientX: 10, clientY: 10,
  }));
  assert.equal(first.model.state.pointerId, null);
  second.view.el.thumb.dispatchEvent(event("pointerdown", {
    pointerId: 2, isPrimary: true, clientX: 10, clientY: 10,
  }));
  assert.equal(second.model.state.pointerId, 2);
});

test("responsive overrides cascade without mutating base options", () => {
  dom.window.innerWidth = 1400;
  const responsive = {
    480: { direction: "bottomToTop", width: "100%" },
    768: { direction: "rightToLeft", width: "560px" },
    1280: { width: "640px" },
  };
  const popup = open({ direction: "center", width: "320px", responsive });
  assert.equal(popup.element.classList.contains("fly-popup--right-to-left"), true);
  assert.equal(popup.element.style.getPropertyValue("--popup-width"), "640px");
  assert.equal(popup.model.baseOptions.direction, "center");
  assert.equal(popup.model.baseOptions.width, "320px");

  dom.window.innerWidth = 600;
  dom.window.dispatchEvent(event("resize"));
  assert.equal(popup.element.classList.contains("fly-popup--bottom-to-top"), true);
  assert.equal(popup.element.classList.contains("fly-popup--right-to-left"), false);
  assert.equal(popup.element.style.getPropertyValue("--popup-width"), "100%");

  dom.window.innerWidth = 400;
  dom.window.dispatchEvent(event("resize"));
  assert.equal(popup.element.classList.contains("fly-popup--center"), true);
  assert.equal(popup.element.style.getPropertyValue("--popup-width"), "320px");
  assert.deepEqual(responsive[768], { direction: "rightToLeft", width: "560px" });
});

test("swipe starts from the edge gesture zone in all four directions", async () => {
  const cases = [
    ["bottomToTop", 100, 100, 100, 220],
    ["topToBottom", 100, 220, 100, 100],
    ["leftToRight", 220, 100, 100, 100],
    ["rightToLeft", 100, 100, 220, 100],
  ];

  for (const [direction, startX, startY, endX, endY] of cases) {
    const popup = open({ direction });
    const gestureZone = popup.view.el.gestureZone;
    gestureZone.dispatchEvent(event("pointerdown", {
      pointerId: 8,
      isPrimary: true,
      clientX: startX,
      clientY: startY,
      timeStamp: 0,
    }));
    assert.equal(popup.model.state.pointerId, 8, direction);
    gestureZone.dispatchEvent(event("pointerup", {
      pointerId: 8,
      clientX: endX,
      clientY: endY,
      timeStamp: 400,
    }));
    await settle();
    assert.equal(popup.lifecycle, "destroyed", direction);
  }
});

test("edge gesture zone handles pointercancel through the shared gesture flow", () => {
  const popup = open({ direction: "bottomToTop", timeout: 100 });
  const gestureZone = popup.view.el.gestureZone;
  gestureZone.dispatchEvent(event("pointerdown", {
    pointerId: 3, isPrimary: true, clientX: 20, clientY: 20,
  }));
  gestureZone.dispatchEvent(event("pointermove", {
    pointerId: 3, clientX: 20, clientY: 180,
  }));
  gestureZone.dispatchEvent(event("pointercancel", { pointerId: 3 }));
  dom.window.flushAnimationFrames();
  assert.equal(popup.model.state.pointerId, null);
  assert.equal(popup.panelElement.style.transform, "translate3d(0,0,0)");
});

test("responsive swipe changes detach and restore gesture handlers", () => {
  dom.window.innerWidth = 600;
  const popup = open({
    direction: "bottomToTop",
    swipeEnabled: true,
    responsive: {
      900: { direction: "rightToLeft", swipeEnabled: false },
    },
  });
  assert.equal(typeof popup.view.el.thumb.onpointerdown, "function");
  assert.equal(typeof popup.view.el.gestureZone.onpointerdown, "function");

  dom.window.innerWidth = 1000;
  dom.window.dispatchEvent(event("resize"));
  assert.equal(popup.element.classList.contains("fly-popup--right-to-left"), true);
  assert.equal(popup.element.classList.contains("fly-popup--swipe-disabled"), true);
  assert.equal(popup.view.el.thumb.onpointerdown, null);
  assert.equal(popup.view.el.gestureZone.onpointerdown, null);

  dom.window.innerWidth = 600;
  dom.window.dispatchEvent(event("resize"));
  assert.equal(popup.element.classList.contains("fly-popup--bottom-to-top"), true);
  assert.equal(popup.element.classList.contains("fly-popup--swipe-disabled"), false);
  assert.equal(typeof popup.view.el.thumb.onpointerdown, "function");
  assert.equal(typeof popup.view.el.gestureZone.onpointerdown, "function");
});

test("responsive false to true enables swipe", () => {
  dom.window.innerWidth = 600;
  const popup = open({
    direction: "rightToLeft",
    swipeEnabled: false,
    responsive: { 900: { swipeEnabled: true } },
  });
  assert.equal(popup.view.el.thumb.onpointerdown, null);

  dom.window.innerWidth = 1000;
  dom.window.dispatchEvent(event("resize"));
  assert.equal(typeof popup.view.el.thumb.onpointerdown, "function");
  assert.equal(popup.element.classList.contains("fly-popup--swipe-disabled"), false);
});

test("responsive direction changes the gesture-zone edge", () => {
  dom.window.innerWidth = 600;
  const popup = open({
    direction: "bottomToTop",
    responsive: { 900: { direction: "rightToLeft" } },
  });
  const gestureZone = popup.view.el.gestureZone;
  assert.equal(popup.element.classList.contains("fly-popup--bottom-to-top"), true);
  assert.equal(typeof gestureZone.onpointerdown, "function");

  dom.window.innerWidth = 1000;
  dom.window.dispatchEvent(event("resize"));
  assert.equal(popup.view.el.gestureZone, gestureZone);
  assert.equal(popup.element.classList.contains("fly-popup--bottom-to-top"), false);
  assert.equal(popup.element.classList.contains("fly-popup--right-to-left"), true);
  assert.equal(typeof gestureZone.onpointerdown, "function");
});

test("disabling swipe during an active gesture clears its transform", () => {
  dom.window.innerWidth = 600;
  const popup = open({
    direction: "bottomToTop",
    swipeEnabled: true,
    responsive: { 900: { direction: "rightToLeft", swipeEnabled: false } },
  });
  const thumb = popup.view.el.thumb;
  thumb.dispatchEvent(event("pointerdown", {
    pointerId: 9, isPrimary: true, clientX: 20, clientY: 20,
  }));
  thumb.dispatchEvent(event("pointermove", {
    pointerId: 9, clientX: 20, clientY: 180,
  }));
  assert.notEqual(popup.panelElement.style.transform, "translate3d(0,0,0)");

  dom.window.innerWidth = 1000;
  dom.window.dispatchEvent(event("resize"));
  assert.equal(popup.model.state.pointerId, null);
  assert.equal(thumb._capturedPointerId, null);
  assert.equal(popup.panelElement.style.transform, "translate3d(0,0,0)");
  assert.equal(popup.view.el.thumb.onpointerdown, null);
});

test("visualViewport values and keyboard-like changes update CSS variables", () => {
  dom.restore();
  dom = installDom({
    visualViewport: { width: 390, height: 640, offsetTop: 12, offsetLeft: 3 },
  });
  const popup = open();
  assert.equal(popup.element.style.getPropertyValue("--popup-viewport-width"), "390px");
  assert.equal(popup.element.style.getPropertyValue("--popup-viewport-height"), "640px");
  assert.equal(popup.element.style.getPropertyValue("--popup-viewport-offset-top"), "12px");
  assert.equal(popup.element.style.getPropertyValue("--popup-viewport-offset-left"), "3px");

  dom.window.visualViewport.height = 500;
  dom.window.visualViewport.offsetTop = 40;
  dom.window.visualViewport.dispatchEvent(event("resize"));
  assert.equal(popup.element.style.getPropertyValue("--popup-viewport-height"), "500px");
  assert.equal(popup.element.style.getPropertyValue("--popup-viewport-offset-top"), "40px");
});

test("layout viewport is used as visualViewport fallback without scrollY", () => {
  dom.window.scrollY = 900;
  const popup = open();
  assert.equal(popup.element.style.getPropertyValue("--popup-viewport-width"), "1024px");
  assert.equal(popup.element.style.getPropertyValue("--popup-viewport-height"), "768px");
  assert.equal(popup.element.style.getPropertyValue("--popup-viewport-offset-top"), "0px");
});

test("shared Symbol runtime is the single stack source across module copies", async () => {
  const popup = open();
  const runtime = globalThis[Symbol.for("@vecdev/popup/runtime/v1")];
  const runtimeCopy = await import(`../src/PopupRuntime.js?copy=${Date.now()}`);
  assert.equal(runtime, getPopupRuntime());
  assert.equal(runtime, runtimeCopy.getPopupRuntime());
  assert.deepEqual(runtime.stack, [popup]);
  assert.equal("activePopups" in popupModule, false);
});

test("last popup cleanup removes shared document and viewport listeners", () => {
  const popup = open();
  assert.equal(dom.document.listeners.get("keydown")?.size, 1);
  assert.equal(dom.window.listeners.get("resize")?.size, 1);
  popup.forceRemove();
  assert.equal(dom.document.listeners.get("keydown")?.size, 0);
  assert.equal(dom.window.listeners.get("resize")?.size, 0);
});

test("failed mount rolls back runtime, body lock and DOM", () => {
  const popup = new Popup({ content: content() });
  popup.view.createSkeleton = () => { throw new Error("mount failed"); };
  assert.throws(() => popup.showPopup(), /mount failed/);
  assert.equal(popup.lifecycle, "destroyed");
  assert.equal(popup.element, null);
  assert.equal(getPopupRuntime().stack.length, 0);
  assert.equal(dom.document.body.style.overflow, "");
});
