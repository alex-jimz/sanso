// Hash routing (#/recipes/123) so GitHub Pages needs no server-side rewrites.
// The router counts in-app history depth, so a back button never leaves the
// app when it was opened straight onto an inner page.

import { afterHistory } from './ui.svelte';

export interface Route {
  path: string;
  segments: string[];
  query: URLSearchParams;
}

function parse(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/recipes';
  const [path = '/recipes', query = ''] = raw.split('?');
  return { path, segments: path.split('/').filter(Boolean), query: new URLSearchParams(query) };
}

class Router {
  route = $state(parse(location.hash));
  private depth = Number(history.state?.depth ?? 0);

  constructor() {
    window.addEventListener('popstate', (event) => {
      this.depth = Number(event.state?.depth ?? 0);
      this.update();
    });
    window.addEventListener('hashchange', () => this.update());
  }

  private update() {
    const next = parse(location.hash);
    if (next.path !== this.route.path || next.query.toString() !== this.route.query.toString()) {
      this.route = next;
    }
  }

  /** Opens a page. `replace` swaps the current page instead of adding a history entry. */
  go(path: string, options: { replace?: boolean } = {}) {
    afterHistory(() => {
      if (options.replace) {
        history.replaceState(
          { ...(history.state ?? {}), depth: this.depth, sheet: undefined },
          '',
          `#${path}`,
        );
      } else {
        this.depth += 1;
        history.pushState({ depth: this.depth }, '', `#${path}`);
      }
      this.route = parse(`#${path}`);
      window.scrollTo(0, 0);
    });
  }

  /** Goes back within the app, or to `fallback` if there's nothing to go back to. */
  back(fallback: string) {
    afterHistory(() => {
      if (this.depth > 0) history.back();
      else this.go(fallback, { replace: true });
    });
  }
}

export const router = new Router();
