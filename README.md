# @vecdev/popup

Firefly popup UI primitive for browser projects.

The package is intended for private GitHub installation.

## Install from private GitHub

```bash
npm install git+ssh://git@github.com:Kerr9111/popup.git
```

Or pin an exact tag:

```bash
npm install git+ssh://git@github.com:Kerr9111/popup.git#v0.1.0
```

## Usage

Import JavaScript:

```js
import Popup from "@vecdev/popup";

const popup = new Popup();
popup.setContent("<div class='fly-popup__title'>Hello</div>");
popup.showPopup({
  swipe: { direction: "rightToLeft", timeout: 300 },
});
```

Import styles from your app SCSS/CSS entry:

```scss
@use "@vecdev/popup/styles/popup.scss";
```

Or with a bundler that supports CSS imports:

```js
import "@vecdev/popup/styles/popup.css";
```

## API

- `new Popup()` - create popup instance.
- `Popup.create(options)` - create, set optional content, and show immediately.
- `setContent(content)` - set string HTML or `HTMLElement` content.
- `showPopup(options)` - render popup.
- `closePopup(closeConfirmOption)` - close through normal close flow.
- `forceRemove()` - remove without confirmation.
- `setSmartPopup(options)` - create a simple confirm-like content block.

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

## Demo

The demo is in `demo/index.html`.

Install dependencies first:

```bash
npm install
```

Then start the local static server:

```bash
npm run demo
```

Open `http://localhost:4173/demo/` in the browser.

Do not open `demo/index.html` through `file://`: browser security rules block ES modules and import maps from file URLs.
