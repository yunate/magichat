import type { Directive } from "vue";

// Focusable elements carrying v-select-all keep their keydown handler here so unmount can detach it.
interface SelectAllElement extends HTMLElement {
  _onSelectAllKeydown?: (event: KeyboardEvent) => void;
}

function isSelectAllShortcut(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && (event.key === "a" || event.key === "A");
}

function isFormControl(el: HTMLElement): el is HTMLTextAreaElement | HTMLInputElement {
  return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement;
}

function selectElementContents(el: HTMLElement): void {
  const selection = window.getSelection();
  if (selection === null) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  selection.removeAllRanges();
  selection.addRange(range);
}

// Ctrl/Cmd+A on a focused element selects only that element's text (never the whole page).
// The listener lives on the element itself, so it fires only while focus is within that block --
// whichever block holds focus is exactly the one whose contents get selected.
export const vSelectAll: Directive<SelectAllElement> = {
  mounted(el) {
    if (!isFormControl(el) && !el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
    const handler = (event: KeyboardEvent): void => {
      if (!isSelectAllShortcut(event)) return;
      event.preventDefault();
      if (isFormControl(el)) {
        el.select();
        return;
      }
      selectElementContents(el);
    };
    el._onSelectAllKeydown = handler;
    el.addEventListener("keydown", handler);
  },
  unmounted(el) {
    if (el._onSelectAllKeydown === undefined) return;
    el.removeEventListener("keydown", el._onSelectAllKeydown);
    el._onSelectAllKeydown = undefined;
  },
};
