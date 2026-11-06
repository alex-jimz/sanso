// Loaded into the service worker. Chrome's Share menu POSTs to ./share (see
// share_target in vite.config.ts). A picture is kept in the cache for the app
// to pick up; a shared page is passed on as ?title=…&text=…&url=…, the way
// the app has always received pages.

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'POST') return;
  const scope = self.registration.scope;
  if (new URL(request.url).pathname !== new URL('share', scope).pathname) return;

  event.respondWith(
    (async () => {
      let form;
      try {
        form = await request.formData();
      } catch {
        return Response.redirect(scope, 303);
      }
      const image = form
        .getAll('image')
        .find((file) => file instanceof File && file.size > 0 && file.type.startsWith('image/'));
      if (image) {
        const cache = await caches.open('sanso-share');
        await cache.put(
          new URL('shared-image', scope).href,
          new Response(image, { headers: { 'Content-Type': image.type } }),
        );
        return Response.redirect(`${scope}?shared-image=1`, 303);
      }
      const params = new URLSearchParams();
      for (const key of ['title', 'text', 'url']) {
        const value = form.get(key);
        if (typeof value === 'string' && value) params.set(key, value);
      }
      const query = params.toString();
      return Response.redirect(query ? `${scope}?${query}` : scope, 303);
    })(),
  );
});
