import Popup from "../src/index.js";

function content(title, text) {
  const wrapper = document.createElement("div");
  wrapper.className = "demo-card";
  wrapper.innerHTML = `
    <h2>${title}</h2>
    <p>${text}</p>
    <button type="button" data-close>Close from content</button>
  `;
  return wrapper;
}

function show(direction = "") {
  const popup = new Popup();
  popup.setContent(
    content(
      direction || "Center",
      "This popup is rendered from the isolated package demo.",
    ),
  );
  popup.showPopup({
    swipe: { direction, timeout: 300 },
    data: { closeBtnText: "Close" },
    styles: direction ? {} : { popup: { maxWidth: "560px" } },
  });
  popup.view.el.popup.querySelector("[data-close]")?.addEventListener("click", () => popup.closePopup());
  return popup;
}

function showConfirm() {
  const popup = new Popup();
  popup.setContent(content("Confirm", "Click backdrop, close button, or Escape."));
  popup.showPopup({
    swipe: { direction: "rightToLeft", timeout: 300 },
    data: { closeBtnText: "Close" },
    closeConfirm: {
      title: "Close this popup?",
      close: true,
      cancel: true,
    },
  });
}

function showNested() {
  const parent = show("leftToRight");
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Open nested popup";
  parent.view.el.popup.prepend(button);
  button.addEventListener("click", () => show("bottomToTop"));
}

function showLong() {
  const popup = new Popup();
  const wrapper = content("Long content", "Scroll inside the popup area if your layout constrains it.");
  for (let i = 1; i <= 20; i += 1) {
    const p = document.createElement("p");
    p.textContent = `Paragraph ${i}. Repeated content for layout checks.`;
    wrapper.appendChild(p);
  }
  popup.setContent(wrapper);
  popup.showPopup({
    swipe: { direction: "bottomToTop", timeout: 300 },
    styles: { popup: { overflow: "auto" } },
  });
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-demo]");
  if (!button) return;

  const demo = button.dataset.demo;
  if (demo === "center") show("");
  else if (demo === "confirm") showConfirm();
  else if (demo === "nested") showNested();
  else if (demo === "long") showLong();
  else show(demo);
});
