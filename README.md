# @vecdev/popup

A standalone ESM popup/dialog component for the browser. The package supports
five placement modes, swipe gestures through a dedicated gesture area, stacked
popups, responsive options, body scroll locking, and full-height iframes.

The package ships both the SCSS source and compiled CSS.

## Installation

```bash
npm i @vecdev/popup
```

```js
import Popup from "@vecdev/popup";
import "@vecdev/popup/styles/popup.css";
```

You can also import the SCSS source directly:

```scss
@use "@vecdev/popup/styles/popup.scss";
```

## Quick Start

```js
const content = document.createElement("section");
content.textContent = "Popup content";

const popup = new Popup({
  content,
  direction: "rightToLeft",
  width: "min(560px, 100%)",
});

popup.showPopup();
```

A factory method that creates and immediately opens a popup is also available:

```js
const popup = Popup.create({ content, direction: "bottomToTop" });
```

`content` and `setContent()` accept only an `HTMLElement`. HTML strings are not
supported, so creating, sanitizing, and escaping markup remains the
application's responsibility.

## Lifecycle

Each popup instance is single-use:

```text
idle -> opening -> open -> closing -> destroyed
```

After a successful `closePopup()` or `forceRemove()` call, the instance is
destroyed. Create a new `Popup` for the next dialog. Calling `showPopup()` on a
destroyed instance throws a descriptive error.

You can use `setContent()` before opening the popup or to replace the content of
an open popup. The method is unavailable after the instance has been destroyed.

## Directions

`direction` describes how the popup enters the viewport:

- `leftToRight` — positioned on the left, enters from left to right, and closes by swiping back to the left;
- `rightToLeft` — positioned on the right, enters from right to left, and closes by swiping right;
- `topToBottom` — positioned at the top, enters downward, and closes by swiping up;
- `bottomToTop` — positioned at the bottom, enters upward, and closes by swiping down;
- `center` — centered popup without swipe-to-close.

A swipe can start only on `.fly-popup__thumb`. The small visual handle is drawn
with `::before`, while the actual gesture/hit area is significantly larger
(48–64 px). Neither the backdrop nor the content is a gesture target. The popup
closes after either a sufficiently long drag or a fast directional flick. A
short gesture or `pointercancel` returns it to the open position.

## Closing

`closePopup()` returns a `Promise<boolean>`:

```js
const closed = await popup.closePopup();
```

The method calls `beforeClose`. If closing is allowed, it waits for the closing
animation, fully cleans up the DOM, runtime state, and body scroll lock, and
only then calls `onClose`. Returning `false` from `beforeClose` keeps the popup
open. The hook can be asynchronous:

```js
const popup = Popup.create({
  content,
  beforeClose: async () => confirmChanges(),
  onClose: ({ forced }) => {
    // Internal cleanup is already complete here.
  },
});
```

An error thrown by `beforeClose` rejects the promise and restores the lifecycle
to `open`. An error thrown by `onClose` does not interrupt internal cleanup and
is also propagated to the caller.

`forceRemove()` skips `beforeClose` and the closing animation. It immediately
cleans up the instance and then calls `onClose({ forced: true })`. Repeated calls
are safe and have no effect.

Backdrop clicks and Escape use the normal `closePopup()` flow. Disable them with
`closeOnBackdrop: false` and `closeOnEscape: false`.

## Content, Scrolling and Iframes

The stable DOM structure is:

```text
.fly-popup
|-- .fly-popup__background
`-- .fly-popup__window
    |-- .fly-popup__content
    |-- .fly-popup__thumb
    `-- .fly-popup__close
```

`.fly-popup__window` is a flex container with `overflow: hidden`. Regular long
content scrolls inside `.fly-popup__content`, which uses `min-height: 0`,
`min-width: 0`, and `overflow: auto`.

An iframe passed directly as the popup content automatically uses the
full-height mode:

```js
const frame = document.createElement("iframe");
frame.src = "/form";
frame.title = "Form";

const popup = Popup.create({
  content: frame,
  direction: "rightToLeft",
  width: "min(720px, 100%)",
});
```

The iframe fills the available `.fly-popup__content` area and scrolls within
its own viewport. Pointer handlers are attached only to the thumb and do not
intercept iframe or content interactions. Iframe messaging, origin validation,
and listener disposal remain the application's responsibility; `onClose` is a
convenient place to complete that cleanup.

## Sizing and CSS Variables

`width`, `maxWidth`, `height`, and `maxHeight` accept a CSS length string or
`null`. Examples include `"480px"`, `"80vw"`, `"min(720px, 100%)"`, and
`"100%"`. Numbers are intentionally not converted implicitly.

```js
Popup.create({
  content,
  direction: "center",
  width: "min(640px, 100%)",
  maxHeight: "calc(100% - 32px)",
});
```

Public generic variables:

- `--popup-z-index`;
- `--popup-animation-duration`;
- `--popup-width`, `--popup-max-width`;
- `--popup-height`, `--popup-max-height`;
- `--popup-backdrop-opacity`;
- `--popup-viewport-width`, `--popup-viewport-height`;
- `--popup-viewport-offset-left`, `--popup-viewport-offset-top`.

## Responsive

Each breakpoint represents a minimum viewport width. All matching responsive
overrides are applied in ascending order without mutating the base options:

```js
Popup.create({
  content,
  direction: "bottomToTop",
  width: "100%",
  maxHeight: "85%",
  responsive: {
    768: {
      direction: "rightToLeft",
      width: "560px",
      height: "100%",
      maxHeight: "100%",
    },
    1280: {
      width: "640px",
    },
  },
});
```

When an open popup is resized, its direction, dimensions, z-index, and
close/scroll options are recalculated. The new layout is applied immediately,
without an intermediate animation or stale modifier classes.

## Stacking, Body Scroll Lock and Viewport

All physical copies of the package within the same browser realm use the shared
runtime stored in `globalThis[Symbol.for("@vecdev/popup/runtime/v1")]`.
Consequently, separate webpack entries share the popup stack, Escape handler,
automatic z-index allocation, and owner-based body scroll lock.

Escape affects only the visually topmost popup. If that popup has
`closeOnEscape: false`, no popup below it is closed. When popups are closed in
any order, the body's original inline `overflow` and `padding-right` values are
restored only after the final lock owner releases them. Disable body scroll
locking for an individual popup with `scrollLock: false`.

`zIndex` is applied to the `.fly-popup` root. If it is omitted, the runtime
assigns a unique level to each active instance. The topmost popup is determined
by the effective z-index and opening order.

When `window.visualViewport` is available, the library updates the viewport
variables using its dimensions and offsets, including resize and scroll changes
caused by browser UI or the virtual keyboard. Otherwise, it falls back to
`window.innerWidth` and `window.innerHeight`.

## Options

```js
{
  content: HTMLElement,
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
  beforeClose: ({ popup }) => true,
  onOpen: ({ popup }) => {},
  onClose: ({ popup, forced }) => {},
  responsive: {}
}
```

`timeout: 0` provides correct immediate opening and closing behavior.

## API

- `new Popup(options?)` — creates an idle instance;
- `Popup.create(options?)` — creates and immediately opens an instance;
- `setContent(element)` — sets or replaces the content `HTMLElement`;
- `showPopup(options?)` — opens the instance;
- `closePopup()` — runs the normal close flow;
- `forceRemove()` — immediately destroys the instance;
- `isOpen`, `lifecycle` — read-only state properties;
- `element`, `panelElement`, `contentElement` — current DOM nodes or `null`.

## Demo

```bash
npm install
npm run demo
```

Open `http://localhost:4173/demo/`. ESM modules, the import map, and iframe
communication will not work when the page is opened through `file://`.

## License

MIT
