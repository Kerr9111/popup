import Popup from "../src/index.js";
import { createParentHub } from "@vecdev/message-bridge";

const IFRAME_CHANNEL = "popup-demo-iframe";

function createContent(title, text) {
  const wrapper = document.createElement("div");
  wrapper.className = "demo-card";
  wrapper.innerHTML = `
    <h2>${title}</h2>
    <p>${text}</p>
    <button type="button" data-close>Close from content</button>
  `;
  return wrapper;
}

function openPopup(options = {}) {
  const content = options.content || createContent(
    options.direction || "center",
    "This popup is rendered from the isolated package demo.",
  );
  const popup = Popup.create({ content, timeout: 300, ...options });
  content.querySelector("[data-close]")?.addEventListener("click", () => {
    popup.closePopup().catch(console.error);
  });
  return popup;
}

function show(direction = "center") {
  return openPopup({
    direction,
    width: direction === "center" ? "min(560px, 100%)" : null,
  });
}

function showConfirm() {
  openPopup({
    content: createContent("beforeClose", "Every normal close asks for confirmation."),
    direction: "rightToLeft",
    beforeClose: () => window.confirm("Close this popup?"),
  });
}

function showStack() {
  const first = show("leftToRight");
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Open another popup";
  first.contentElement.prepend(button);
  button.addEventListener("click", () => show("bottomToTop"));
}

function showLong() {
  const content = createContent("Long content", "Only the content area scrolls.");
  for (let index = 1; index <= 30; index += 1) {
    const paragraph = document.createElement("p");
    paragraph.textContent = `Paragraph ${index}. Repeated content for scroll checks.`;
    content.appendChild(paragraph);
  }
  openPopup({
    content,
    direction: "bottomToTop",
    height: "min(680px, 90%)",
  });
}

function showWithoutCloseButton() {
  openPopup({
    content: createContent(
      "Without close button",
      "Use the content button, backdrop, Escape, or thumb swipe.",
    ),
    direction: "bottomToTop",
    showCloseButton: false,
  });
}

function showResponsiveSwipe() {
  openPopup({
    content: createContent(
      "Responsive swipe",
      "Mobile: bottom sheet with swipe. Desktop: right side panel without swipe.",
    ),
    direction: "bottomToTop",
    swipeEnabled: true,
    responsive: {
      900: {
        direction: "rightToLeft",
        swipeEnabled: false,
      },
    },
  });
}

function showIframe() {
  const iframe = document.createElement("iframe");
  const hub = createParentHub({ channel: IFRAME_CHANNEL });
  let unregister = () => {};
  let offClose = () => {};

  iframe.className = "demo-iframe";
  iframe.src = "./iframe.html";
  iframe.title = "Popup iframe demo";

  const popup = Popup.create({
    content: iframe,
    direction: "rightToLeft",
    width: "min(720px, 100%)",
    onClose: () => {
      unregister();
      offClose();
      hub.destroy();
    },
  });

  unregister = hub.register("popup-demo", iframe);
  offClose = hub.on("close", (_payload, meta) => {
    if (meta.source !== iframe.contentWindow) return;
    popup.closePopup().catch(console.error);
  });
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-demo]");
  if (!button) return;

  const demo = button.dataset.demo;
  if (demo === "center") show();
  else if (demo === "confirm") showConfirm();
  else if (demo === "iframe") showIframe();
  else if (demo === "nested") showStack();
  else if (demo === "long") showLong();
  else if (demo === "withoutCloseButton") showWithoutCloseButton();
  else if (demo === "responsiveSwipe") showResponsiveSwipe();
  else show(demo);
});
