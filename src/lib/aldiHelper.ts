// The aldi.ie helper as a bookmark ("bookmarklet"). Chrome on Android has no
// extensions, but a bookmark whose address is javascript:… runs on the page
// that is open when it's picked from the address bar.
//
// On aldi.ie it collects the product numbers on the page, asks Aldi's product
// API for their details from the user's own browser (the same requests the
// page itself makes), and opens Sanso with the results in the address's
// #fragment, which never leaves the phone. See src/lib/aldi.ts for the
// receiving side.

import source from './aldiBookmarklet.js?raw';

/** The app's own address, e.g. https://alex-jimz.github.io/sanso/. */
export function appUrl(): string {
  return new URL(import.meta.env.BASE_URL, location.origin).href;
}

export function helperBookmark(app = appUrl()): string {
  const code = source
    .replace('__SANSO_APP__', app)
    .split('\n')
    .map((line) => line.trim())
    // Joined onto one line, a // comment would hide the code after it.
    .filter((line) => !line.startsWith('//'))
    .join(' ');
  // Only what a URL can't hold as it is gets escaped, which keeps the bookmark
  // much shorter than encodeURIComponent would. Chrome decodes it before running.
  const escaped = code.replace(/[^\w!$&'()*+,\-./:;=?@[\]^{|}~]/gu, (c) => encodeURIComponent(c));
  return `javascript:${escaped}`;
}
