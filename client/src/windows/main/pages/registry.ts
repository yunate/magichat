import type { PageDefinition } from "./types";

class PageRegistry {
  registerPage(definition: PageDefinition): void {
    if (this._pages.some((page) => page.path === definition.path)) {
      console.warn(`[pages] duplicate page path ignored: ${definition.path}`);
      return;
    }
    this._pages.push(definition);
  }

  getPages(): readonly PageDefinition[] {
    return [...this._pages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  private _pages: PageDefinition[] = [];
}

export const gPageRegistry = new PageRegistry();
