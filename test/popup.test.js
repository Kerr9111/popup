import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import Popup, { activePopups } from "../src/index.js";
import { getPopupRuntime } from "../src/PopupRuntime.js";
import { event, FakeElement, installDom } from "./domHarness.js";

let dom;
const runtime = getPopupRuntime();

beforeEach(() => {
  assert.equal(runtime.stack.length, 0);
  assert.equal(runtime.bodyLockOwners.size, 0);
  dom = installDom();
});

afterEach(() => {
  for (const popup of [...runtime.stack]) {
    try {
      popup.forceRemove();
    } catch {}
  }
  dom.restore();
});

test("forceRemove is idempotent", () => {
  let closeCount = 0;
  const popup = Popup.create({ callback: () => closeCount += 1 });

  popup.forceRemove();
  popup.forceRemove();
  popup.forceRemove();

  assert.equal(closeCount, 1);
  assert.equal(popup.isOpen, false);
  assert.equal(popup.element, null);
  assert.equal(activePopups.length, 0);
});

test("callback errors happen after complete cleanup", () => {
  const popup = Popup.create({
    callback: () => {
      throw new Error("consumer failure");
    },
  });

  assert.throws(() => popup.forceRemove(), /consumer failure/);
  assert.equal(popup.isOpen, false);
  assert.equal(popup.element, null);
  assert.equal(activePopups.length, 0);
  assert.equal(dom.document.body.style.overflow, "");
});

test("callback can call forceRemove again", () => {
  let closeCount = 0;
  let popup;
  popup = Popup.create({
    callback: () => {
      closeCount += 1;
      popup.forceRemove();
    },
  });

  popup.forceRemove();
  assert.equal(closeCount, 1);
  assert.equal(activePopups.length, 0);
});

test("legacy callback and onClose run once with cleaned references", () => {
  const calls = [];
  const popup = Popup.create({
    callback: () => calls.push("callback"),
    onClose: (context) => calls.push(context.reason),
  });

  popup.closePopup();
  assert.deepEqual(calls, ["callback", "api"]);
  assert.equal(popup.model.state.onCloseCallback, null);
  assert.equal(popup.model.state.onClose, null);
  assert.equal("callback" in popup.model.baseOptions, false);
  assert.equal("onClose" in popup.model.baseOptions, false);
});

test("removal cancels pending animation frames", () => {
  const popup = Popup.create({ swipe: { direction: "rightToLeft", timeout: 300 } });
  const panel = popup.panelElement;
  assert.equal(dom.window._frames.size, 1);

  popup.forceRemove();
  assert.equal(dom.window._frames.size, 0);
  dom.window.flushAnimationFrames();
  assert.equal(panel.style.transform || "", "");
});

test("removal cancels timeout fallback when requestAnimationFrame is unavailable", async () => {
  dom.window.requestAnimationFrame = null;
  const popup = Popup.create({ swipe: { direction: "rightToLeft", timeout: 300 } });
  const panel = popup.panelElement;

  popup.forceRemove();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(panel.style.transform || "", "");
});

for (const order of ["parent-first", "child-first"]) {
  test(`body lock restores styles when closing ${order}`, () => {
    dom.document.body.style.overflow = "auto";
    dom.document.body.style.paddingRight = "7px";
    dom.document.body._computedPaddingRight = "7px";

    const first = Popup.create();
    const second = Popup.create();
    assert.equal(dom.document.body.style.overflow, "hidden");
    assert.equal(dom.document.body.style.paddingRight, "31px");

    const closingOrder = order === "parent-first" ? [first, second] : [second, first];
    closingOrder[0].forceRemove();
    assert.equal(dom.document.body.style.overflow, "hidden");
    closingOrder[1].forceRemove();

    assert.equal(dom.document.body.style.overflow, "auto");
    assert.equal(dom.document.body.style.paddingRight, "7px");
  });
}

test("physical runtime module copies share one global runtime", async () => {
  const first = await import(`../src/PopupRuntime.js?copy=first-${Date.now()}`);
  const second = await import(`../src/PopupRuntime.js?copy=second-${Date.now()}`);

  assert.equal(first.getPopupRuntime(), second.getPopupRuntime());
  assert.equal(first.activePopups, second.activePopups);
});

test("Escape closes only the topmost popup", () => {
  const first = Popup.create();
  const second = Popup.create();

  dom.document.dispatchEvent(event("keydown", { key: "Escape" }));
  assert.equal(second.isOpen, false);
  assert.equal(first.isOpen, true);

  dom.document.dispatchEvent(event("keydown", { key: "Escape" }));
  assert.equal(first.isOpen, false);
});

test("runtime owns one global listener set and removes it with the last popup", () => {
  const first = Popup.create();
  const second = Popup.create();
  assert.equal(dom.document.listeners.get("keydown").size, 1);
  assert.equal(dom.window.listeners.get("resize").size, 1);

  second.forceRemove();
  assert.equal(dom.document.listeners.get("keydown").size, 1);
  first.forceRemove();
  assert.equal(dom.document.listeners.get("keydown").size, 0);
  assert.equal(dom.window.listeners.get("resize").size, 0);
});

test("topmost closeOnEscape false blocks Escape without closing lower popup", () => {
  const first = Popup.create();
  const second = Popup.create({ closeOnEscape: false });

  dom.document.dispatchEvent(event("keydown", { key: "Escape" }));
  assert.equal(first.isOpen, true);
  assert.equal(second.isOpen, true);
});

test("closeOnBackdrop false keeps popup open", () => {
  const popup = Popup.create({ closeOnBackdrop: false });
  popup.view.el.bg.dispatchEvent(event("click"));
  assert.equal(popup.isOpen, true);
});

test("scrollLock false does not participate in body locking", () => {
  const unlocked = Popup.create({ scrollLock: false });
  assert.equal(dom.document.body.style.overflow, "");

  const locked = Popup.create();
  assert.equal(dom.document.body.style.overflow, "hidden");
  locked.forceRemove();
  assert.equal(dom.document.body.style.overflow, "");
  assert.equal(unlocked.isOpen, true);
});

test("automatic z-index remains unique after middle removal", () => {
  const first = Popup.create();
  const second = Popup.create();
  const third = Popup.create();
  const used = [first, second, third].map((popup) => popup.element.style.zIndex);

  second.forceRemove();
  const fourth = Popup.create();
  used.push(fourth.element.style.zIndex);

  assert.equal(new Set(used).size, used.length);
});

test("explicit zIndex is applied to the root and defines topmost popup", () => {
  const high = Popup.create({ zIndex: 5000 });
  const automatic = Popup.create();
  assert.equal(high.element.style.zIndex, "5000");

  dom.document.dispatchEvent(event("keydown", { key: "Escape" }));
  assert.equal(high.isOpen, false);
  assert.equal(automatic.isOpen, true);
});

test("center and confirm positioning do not use document scroll coordinates", () => {
  dom.window.scrollY = 900;
  const popup = Popup.create({
    closeConfirm: { title: "Close?", close: true, cancel: true },
  });

  assert.equal(popup.panelElement.style.top || "", "");
  popup.closePopup();
  const confirm = popup.view.el.confirmWrap.querySelector(".fly-popup__close-confirm-content");
  assert.equal(confirm.style.top || "", "");
});

test("responsive options cascade and reset from immutable base options", () => {
  const popup = Popup.create({
    styles: { popup: { width: "50px", color: "red" } },
    responsive: {
      800: {
        styles: { popup: { width: "80px" } },
        swipe: { direction: "rightToLeft" },
      },
      1000: { styles: { popup: { color: "blue" } } },
    },
  });
  assert.equal(popup.panelElement.style.width, "80px");
  assert.equal(popup.panelElement.style.color, "blue");
  assert.equal(popup.element.classList.contains("fly-popup--right-to-left"), true);

  dom.window.innerWidth = 700;
  dom.window.dispatchEvent(event("resize"));
  assert.equal(popup.panelElement.style.width, "50px");
  assert.equal(popup.panelElement.style.color, "red");
  assert.equal(popup.element.classList.contains("fly-popup--right-to-left"), false);
});

test("showPopup accepts content including an empty string", () => {
  const popup = new Popup();
  popup.showPopup({ content: "" });
  assert.equal(popup.panelElement.innerHTML, "");

  popup.forceRemove();
  const element = new FakeElement("section");
  popup.showPopup({ content: element });
  assert.equal(popup.panelElement.children.includes(element), true);
});

test("an empty popup still mounts its controls", () => {
  const popup = Popup.create({ swipe: { direction: "bottomToTop", timeout: 0 } });
  assert.equal(popup.view.el.thumb.isConnected, true);
  assert.equal(popup.view.el.closeBtn.isConnected, true);
});

test("timeout zero puts a directional popup into its final state immediately", () => {
  const popup = Popup.create({ swipe: { direction: "bottomToTop", timeout: 0 } });
  assert.equal(popup.panelElement.style.transition, "none");
  assert.equal(popup.panelElement.style.transform, "translate3d(0,0,0)");
});

test("one instance can reopen without stale responsive values", () => {
  const popup = new Popup();
  dom.window.innerWidth = 900;
  popup.showPopup({
    styles: { popup: { width: "40px" } },
    responsive: { 800: { styles: { popup: { width: "80px" } } } },
  });
  assert.equal(popup.panelElement.style.width, "80px");
  popup.forceRemove();

  dom.window.innerWidth = 600;
  popup.showPopup();
  assert.equal(popup.panelElement.style.width, "40px");
});

test("pointer cancel resets a swipe without closing", () => {
  const popup = Popup.create({ swipe: { direction: "rightToLeft", timeout: 100 } });
  dom.window.flushAnimationFrames();
  const thumb = popup.view.el.thumb;

  thumb.dispatchEvent(event("pointerdown", {
    pointerId: 1,
    isPrimary: true,
    clientX: 100,
    clientY: 100,
  }));
  thumb.dispatchEvent(event("pointermove", {
    pointerId: 1,
    clientX: 300,
    clientY: 100,
  }));
  assert.notEqual(popup.panelElement.style.transform, "translate3d(0,0,0)");

  thumb.dispatchEvent(event("pointercancel", { pointerId: 1 }));
  dom.window.flushAnimationFrames();
  assert.equal(popup.isOpen, true);
  assert.equal(popup.panelElement.style.transform, "translate3d(0,0,0)");
});

test("all four pointer directions close past the same threshold", () => {
  const cases = [
    ["bottomToTop", 100, 100, 100, 200],
    ["topToBottom", 100, 200, 100, 100],
    ["leftToRight", 200, 100, 50, 100],
    ["rightToLeft", 50, 100, 200, 100],
  ];

  for (const [direction, startX, startY, endX, endY] of cases) {
    const popup = Popup.create({ swipe: { direction, timeout: 0 } });
    const thumb = popup.view.el.thumb;
    thumb.dispatchEvent(event("pointerdown", {
      pointerId: 1,
      isPrimary: true,
      clientX: startX,
      clientY: startY,
    }));
    thumb.dispatchEvent(event("pointerup", {
      pointerId: 1,
      clientX: endX,
      clientY: endY,
    }));
    assert.equal(popup.isOpen, false, direction);
  }
});

test("visualViewport values are exposed as root CSS variables", () => {
  dom.restore();
  dom = installDom({
    visualViewport: { width: 390, height: 640, offsetTop: 12, offsetLeft: 3 },
  });
  const popup = Popup.create();

  assert.equal(popup.element.style.getPropertyValue("--popup-viewport-width"), "390px");
  assert.equal(popup.element.style.getPropertyValue("--popup-viewport-height"), "640px");
  assert.equal(popup.element.style.getPropertyValue("--popup-viewport-offset-top"), "12px");
  assert.equal(popup.element.style.getPropertyValue("--popup-viewport-offset-left"), "3px");

  dom.window.visualViewport.height = 520;
  dom.window.visualViewport.offsetTop = 24;
  dom.window.visualViewport.dispatchEvent(event("scroll"));
  assert.equal(popup.element.style.getPropertyValue("--popup-viewport-height"), "520px");
  assert.equal(popup.element.style.getPropertyValue("--popup-viewport-offset-top"), "24px");
});

test("fallback viewport values are used without visualViewport", () => {
  const popup = Popup.create();
  assert.equal(popup.element.style.getPropertyValue("--popup-viewport-width"), "1024px");
  assert.equal(popup.element.style.getPropertyValue("--popup-viewport-height"), "768px");
});

test("failed mount rolls back runtime, body lock, DOM and lifecycle", () => {
  const popup = new Popup();
  popup.setContent("content");
  popup.view.mountContent = () => {
    throw new Error("mount failed");
  };

  assert.throws(() => popup.showPopup(), /mount failed/);
  assert.equal(popup.isOpen, false);
  assert.equal(popup.element, null);
  assert.equal(activePopups.length, 0);
  assert.equal(dom.document.body.style.overflow, "");
});

test("setSmartPopup renders title and description as text", () => {
  const popup = new Popup();
  const content = popup.setSmartPopup({
    title: "<img src=x onerror=alert(1)>",
    description: "<script>alert(1)</script>",
  });

  assert.equal(content.querySelector(".fly-popup__confirm-title").textContent, "<img src=x onerror=alert(1)>");
  assert.equal(content.querySelector(".fly-popup__confirm-description").textContent, "<script>alert(1)</script>");
  assert.equal(content.innerHTML, "");
});
