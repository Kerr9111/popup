# @vecdev/popup

Независимый ESM-компонент popup/dialog для браузера. Пакет поддерживает пять
режимов размещения, свайп с отдельной gesture-zone, несколько открытых окон,
responsive-настройки, блокировку прокрутки страницы и full-height iframe.

Пакет поставляет исходный SCSS и собранный CSS.

## Установка

```bash
npm i @vecdev/popup
```

```js
import Popup from "@vecdev/popup";
import "@vecdev/popup/styles/popup.css";
```

SCSS можно подключить напрямую:

```scss
@use "@vecdev/popup/styles/popup.scss";
```

## Быстрый старт

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

Также доступна фабрика, сразу открывающая popup:

```js
const popup = Popup.create({ content, direction: "bottomToTop" });
```

`content` и `setContent()` принимают только `HTMLElement`. Строки HTML не
поддерживаются: создание, очистка и экранирование разметки остаются под
контролем приложения.

## Lifecycle

Экземпляр одноразовый:

```text
idle -> opening -> open -> closing -> destroyed
```

После успешного `closePopup()` или `forceRemove()` экземпляр уничтожен. Для
следующего окна создайте новый `Popup`. Вызов `showPopup()` для уничтоженного
экземпляра бросает понятную ошибку.

`setContent()` можно использовать до открытия или для замены контента уже
открытого окна. После уничтожения метод недоступен.

## Направления

`direction` описывает направление появления:

- `leftToRight` — окно слева, появляется вправо, закрывается свайпом влево;
- `rightToLeft` — окно справа, появляется влево, закрывается свайпом вправо;
- `topToBottom` — окно сверху, появляется вниз, закрывается свайпом вверх;
- `bottomToTop` — окно снизу, появляется вверх, закрывается свайпом вниз;
- `center` — окно по центру, без swipe-to-close.

Свайп начинается только на `.fly-popup__thumb`. Визуальная полоска рисуется
через `::before`, а реальная hit-area заметно больше (48–64 px). Backdrop и
контент не являются gesture targets. Закрытие происходит по достаточной
дистанции либо по быстрому направленному flick; короткий жест и
`pointercancel` возвращают окно в открытое положение.

## Закрытие

`closePopup()` возвращает `Promise<boolean>`:

```js
const closed = await popup.closePopup();
```

Метод вызывает `beforeClose`, при разрешении проигрывает анимацию, полностью
очищает DOM/runtime/body-lock и только затем вызывает `onClose`. `false` из
`beforeClose` оставляет popup открытым. Hook может быть асинхронным:

```js
const popup = Popup.create({
  content,
  beforeClose: async () => confirmChanges(),
  onClose: ({ forced }) => {
    // Internal cleanup здесь уже завершён.
  },
});
```

Ошибка из `beforeClose` отклоняет Promise и возвращает lifecycle в `open`.
Ошибка из `onClose` не мешает внутренней очистке и также передаётся вызывающему
коду.

`forceRemove()` не вызывает `beforeClose` и не ждёт анимацию. Он немедленно
очищает экземпляр, затем вызывает `onClose({ forced: true })`. Повторные вызовы
безопасны и ничего не делают.

Backdrop и Escape используют обычный `closePopup()`. Их можно отключить через
`closeOnBackdrop: false` и `closeOnEscape: false`.

## Контент, scroll и iframe

Стабильная DOM-структура:

```text
.fly-popup
|-- .fly-popup__background
`-- .fly-popup__window
    |-- .fly-popup__content
    |-- .fly-popup__thumb
    `-- .fly-popup__close
```

`.fly-popup__window` — flex-контейнер с `overflow: hidden`. Обычный длинный
контент прокручивается внутри `.fly-popup__content`, у которого заданы
`min-height: 0`, `min-width: 0` и `overflow: auto`.

Iframe, переданный как непосредственный content, автоматически получает режим
full-height:

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

Iframe занимает всю доступную область `.fly-popup__content` и прокручивается в
собственном viewport. Pointer handlers находятся только на thumb и не
перехватывают работу iframe. Обмен сообщениями с iframe, проверка origin и
отписки относятся к приложению; их удобно завершать в `onClose`.

## Размеры и CSS variables

`width`, `maxWidth`, `height`, `maxHeight` принимают CSS length string либо
`null`. Например: `"480px"`, `"80vw"`, `"min(720px, 100%)"`, `"100%"`.
Числа намеренно не преобразуются неявно.

```js
Popup.create({
  content,
  direction: "center",
  width: "min(640px, 100%)",
  maxHeight: "calc(100% - 32px)",
});
```

Публичные generic variables:

- `--popup-z-index`;
- `--popup-animation-duration`;
- `--popup-width`, `--popup-max-width`;
- `--popup-height`, `--popup-max-height`;
- `--popup-backdrop-opacity`;
- `--popup-viewport-width`, `--popup-viewport-height`;
- `--popup-viewport-offset-left`, `--popup-viewport-offset-top`.

## Responsive

Breakpoint — минимальная ширина viewport. Все совпавшие overrides применяются
по возрастанию, не изменяя базовые options:

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

При resize открытого popup direction, размеры, z-index и close/scroll options
пересчитываются. Новый layout применяется сразу, без промежуточной анимации и
без оставшихся modifier-классов.

## Stack, body lock и viewport

Все физические копии пакета в одном browser realm используют общий runtime в
`globalThis[Symbol.for("@vecdev/popup/runtime/v1")]`. Поэтому webpack entries
разделяют stack, Escape handler, auto z-index и owner-based body lock.

Escape воздействует только на визуально верхний popup. Если у него
`closeOnEscape: false`, нижний popup не закрывается. При закрытии окон в любом
порядке исходные inline `overflow` и `padding-right` body восстанавливаются
только после освобождения последнего lock owner. Для отдельного popup блокировку
можно выключить через `scrollLock: false`.

`zIndex` задаётся на корне `.fly-popup`. Без него runtime выдаёт уникальный
уровень для каждого активного экземпляра; topmost определяется по итоговому
z-index и порядку открытия.

При наличии `window.visualViewport` библиотека обновляет viewport variables по
его размерам и offset, включая resize/scroll от browser UI или виртуальной
клавиатуры. Иначе используются `window.innerWidth` и `window.innerHeight`.

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

`timeout: 0` означает корректное мгновенное открытие и закрытие.

## API

- `new Popup(options?)` — создать idle-экземпляр;
- `Popup.create(options?)` — создать и сразу открыть;
- `setContent(element)` — установить или заменить HTMLElement;
- `showPopup(options?)` — открыть экземпляр;
- `closePopup()` — выполнить normal close flow;
- `forceRemove()` — немедленно уничтожить экземпляр;
- `isOpen`, `lifecycle` — read-only состояние;
- `element`, `panelElement`, `contentElement` — текущие DOM-узлы или `null`.

## Demo

```bash
npm install
npm run demo
```

Откройте `http://localhost:4173/demo/`. Через `file://` ESM/import map и iframe
работать не будут.

## License

MIT
