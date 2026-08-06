import { createChildPort } from "@vecdev/message-bridge";

const port = createChildPort({
  channel: "popup-demo-iframe",
  targetOrigin: location.origin,
});

document.querySelector("[data-close]")?.addEventListener("click", () => {
  port.emit("close", { source: "iframe-button" });
});

window.addEventListener("pagehide", () => port.destroy(), { once: true });
