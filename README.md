# @vecdev/popup

Dependency-light browser popup with four slide directions, touch gestures,
close confirmation, nested popup stacking, responsive options, and iframe
integration.

The package is an ESM module and ships both SCSS source and compiled CSS.

## Installation

```bash
npm i @vecdev/popup
```

Import the JavaScript API:

```js
import Popup from "@vecdev/popup";
```

Import compiled CSS from a JavaScript entry:

```js 
import "@vecdev/popup/styles/popup.css";
```

Or include the SCSS source in your application styles:

```scss
@use "@vecdev/popup/styles/popup.scss";
```

## Basic Usage

```js
import Popup from "@vecdev/popup";
import "@vecdev/popup/styles/popup.css";

const content = document.createElement("div");
content.innerHTML = `
  <h2 class="fly-popup__title">Popup title</h2>
  <p>Popup content.</p>
`;

const popup = new Popup();
popup.setContent(content);
popup.showPopup({
  swipe: {
    direction: "rightToLeft",
    timeout: 300,
  },
});
```

`setContent()` accepts either an `HTMLElement` or an HTML string.

## Factory Usage

`Popup.create()` creates, configures, and opens an instance immediately:

```js
const popup = Popup.create({
  content: "<div class='fly-popup__title'>Created by factory</div>",
  swipe: { direction: "bottomToTop", timeout: 300 },
});
```

## Slide Directions

The `swipe.direction` option accepts:

- `"bottomToTop"` - opens from the bottom and closes by dragging down.
- `"topToBottom"` - opens from the top and closes by dragging up.
- `"leftToRight"` - opens from the left and closes by dragging left.
- `"rightToLeft"` - opens from the right and closes by dragging right.
- `""` - displays a centered popup without a slide direction.

On touch devices the popup follows the gesture. Releasing before the 10% close
threshold returns it to the open position. Side popups expose a narrow drag
handle at the window edge; this handle remains available when the content is an
iframe, because touch events do not bubble out of an iframe document.

## Closing

Use `closePopup()` for the normal close flow:

```js
closeButton.addEventListener("click", () => popup.closePopup());
```

It respects the `lockClose` and `closeConfirm` options configured by
`showPopup()`. Pass an explicit close-confirm object to override the current
configuration:

```js
popup.closePopup({
  title: "Close without saving?",
  close: true,
  cancel: true,
});
```

Use `forceRemove()` only when the popup must be removed without confirmation:

```js
popup.forceRemove();
```

The close button, backdrop, Escape key, content controls, and swipe gestures all
use the same normal close flow. When several popups are open, Escape affects
only the topmost instance.

## Close Confirmation

```js
const popup = new Popup();
popup.setContent("<p>Unsaved form data</p>");
popup.showPopup({
  swipe: { direction: "rightToLeft", timeout: 300 },
  closeConfirm: {
    title: "Close without saving?",
    saveAndClose: true,
    close: true,
    cancel: true,
  },
});
```

The flags control which actions are displayed:

- `saveAndClose` - display a Save-labelled action and then close.
- `close` - display the Close action.
- `cancel` - display the Back action and keep the popup open.

The package only controls the action visibility and popup lifecycle. It does not
persist application data. Use controls in your own popup content when saving
requires an asynchronous application handler, then close the popup after that
handler succeeds.

## Iframe Content

An iframe has its own JavaScript context. A button inside it cannot call the
parent popup instance directly, and DOM events do not cross the iframe boundary.
Use [`@vecdev/message-bridge`](https://www.npmjs.com/package/@vecdev/message-bridge)
to send a close event to the parent page.

Install both packages when using the bridge directly in application code:

```bash
npm i @vecdev/popup @vecdev/message-bridge
```

### Parent Page

```js
import Popup from "@vecdev/popup";
import { createParentHub } from "@vecdev/message-bridge";
import "@vecdev/popup/styles/popup.css";

const channel = "profile-form-popup";
const popup = new Popup();
const iframe = document.createElement("iframe");
const hub = createParentHub({ channel });

let unregister = () => {};
let offClose = () => {};

iframe.src = "/profile/form";
iframe.title = "Profile form";
iframe.className = "profile-popup-frame";

popup.setContent(iframe);
popup.showPopup({
  swipe: { direction: "rightToLeft", timeout: 300 },
  callback: () => {
    offClose();
    unregister();
    hub.destroy();
  },
});

unregister = hub.register("profile-form", iframe);
offClose = hub.on("close", (payload, meta) => {
  if (meta.source !== iframe.contentWindow) return;

  if (payload?.refresh) {
    // Refresh parent data if the iframe saved something.
  }

  popup.closePopup();
});
```

Give the iframe stable dimensions in the parent application:

```css
.profile-popup-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}
```

Checking `meta.source` prevents another frame using the same channel from
closing this popup. For cross-origin frames, configure `allowedOrigins` and
`targetOrigin` explicitly instead of using `"*"`.

### Iframe Page

```js
import { createChildPort } from "@vecdev/message-bridge";

const port = createChildPort({
  channel: "profile-form-popup",
  targetOrigin: window.location.origin,
});

document.querySelector("[data-popup-close]")?.addEventListener("click", () => {
  port.emit("close", {
    refresh: true,
    reason: "saved",
  });
});

window.addEventListener("pagehide", () => port.destroy(), { once: true });
```

Example iframe markup:

```html
<button type="button" data-popup-close>Close</button>
```

## Responsive Options

Responsive entries are applied from the smallest matching breakpoint upward:

```js
popup.showPopup({
  swipe: { direction: "rightToLeft", timeout: 300 },
  responsive: {
    768: {
      styles: { popup: { width: "80%" } },
    },
    1280: {
      styles: { popup: { width: "60%" } },
    },
  },
});
```

## Options

```js
{
  content: HTMLElement | string,
  swipe: {
    direction: "bottomToTop" | "topToBottom" | "leftToRight" | "rightToLeft" | "",
    timeout: 300
  },
  styles: {
    popup: {},
    bg: {}
  },
  responsive: {
    768: { styles: { popup: { width: "80%" } } }
  },
  closeConfirm: {
    title: "Close without saving?",
    close: true,
    saveAndClose: false,
    cancel: true
  },
  lockClose: false,
  callback: () => {}
}
```

The `callback` function runs when the popup is removed. Use it to unsubscribe
event handlers, destroy message bridges, and release application resources.

## API

- `new Popup()` - create a popup instance.
- `Popup.create(options)` - create and show a popup immediately.
- `setContent(content)` - set an HTML string or `HTMLElement`.
- `showPopup(options)` - mount and display the popup.
- `closePopup(closeConfirmOption?)` - run the normal close flow.
- `forceRemove()` - remove the popup without confirmation.
- `setSmartPopup(options)` - create a simple confirm-like content element.
- `activePopups` - exported live array of currently open popup instances.

## Demo

Clone the repository and install dependencies:

```bash
npm install
npm run demo
```

Open `http://localhost:4173/demo/`.

The playground includes centered and directional popups, close confirmation,
nested windows, long content, mobile swipe behavior, and a right-side iframe
that closes itself through `@vecdev/message-bridge`.

Do not open `demo/index.html` through `file://`: browser security rules block ES
modules, import maps, and iframe communication for local file URLs.

## License

MIT
