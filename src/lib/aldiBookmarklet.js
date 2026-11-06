(async () => {
  const app = '__SANSO_APP__';
  const say = (message) => alert('Sanso: ' + message);
  if (!/(^|\.)aldi\.ie$/.test(location.hostname)) {
    say('open a product, offers or search page on aldi.ie first, then run this again.');
    return;
  }
  const skuOf = (path) => (/\/product\/[^/]*-(\d{6,18})\/?$/.exec(path) || [])[1];
  const linkSku = (link) => skuOf(new URL(link.href, location.href).pathname);
  const clean = (value, max) => (value || '').replace(/\s+/g, ' ').trim().slice(0, max);
  // The text the page shows around a product (name, size, price), from the
  // smallest block that has a price in it and no other product's link.
  const textNear = (element, sku, max) => {
    for (let node = element, i = 0; node && node !== document.body && i < 8; i++) {
      const shown = node.innerText || '';
      if (/€\s?\d/.test(shown)) {
        const others = [...node.querySelectorAll('a[href*="/product/"]')].some((a) => {
          const other = linkSku(a);
          return other && other !== sku;
        });
        return others ? '' : clean(shown, max);
      }
      node = node.parentElement;
    }
    return '';
  };
  const skus = [];
  const onPage = {};
  const own = skuOf(location.pathname);
  if (own) {
    skus.push(own);
    const heading = document.querySelector('h1');
    onPage[own] = {
      name: clean(heading && heading.innerText, 120),
      text: heading ? textNear(heading, own, 400) : '',
    };
  } else
    for (const link of document.querySelectorAll('a[href*="/product/"]')) {
      const sku = linkSku(link);
      if (!sku) continue;
      if (!skus.includes(sku)) skus.push(sku);
      const seen = onPage[sku] || { name: '', text: '' };
      seen.name = seen.name || clean(link.innerText || link.getAttribute('aria-label'), 120);
      seen.text = seen.text || textNear(link, sku, 240);
      onPage[sku] = seen;
    }
  if (!skus.length) {
    say('there are no products on this page. Scroll until they show, then run this again.');
    return;
  }
  const flat = (object) => {
    const out = {};
    for (const [key, value] of Object.entries(object || {}))
      if (value === null || ['string', 'number', 'boolean'].includes(typeof value))
        out[key] = typeof value === 'string' ? value.slice(0, 200) : value;
    return out;
  };
  const pick = (data) => {
    const out = flat(data);
    out.price = flat(data.price);
    out.image = ((data.assets || []).find((a) => a && a.url) || {}).url;
    out.via = 'api';
    return out;
  };
  const fetchOne = async (sku) => {
    const url = 'https://api.aldi.ie/v2/products/' + sku + '?serviceType=walk-in';
    for (const credentials of ['omit', 'include']) {
      try {
        const response = await fetch(url, { credentials });
        if (response.ok) {
          const body = await response.json();
          if (body && body.data) return pick(body.data);
        }
      } catch (error) {
        console.warn('Sanso:', error);
      }
    }
    return null;
  };
  const sizeText = (value) =>
    value && typeof value === 'object'
      ? [value.value, value.unitText || value.unitCode].filter(Boolean).join(' ')
      : typeof value === 'string'
        ? value
        : '';
  const fromLdJson = () => {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const found = [].concat(JSON.parse(script.textContent));
        const product = found.find((item) => item && /Product$/.test(item['@type']));
        if (product) {
          const offer = [].concat(product.offers || [])[0] || {};
          return {
            name: product.name,
            brandName: product.brand && product.brand.name,
            priceDisplay: offer.price ? String(offer.price) : undefined,
            size: sizeText(product.size) || sizeText(product.weight),
            image: [].concat(product.image || [])[0],
          };
        }
      } catch (error) {
        console.warn('Sanso:', error);
      }
    }
    return {};
  };
  // When the API doesn't answer for a product, what the page shows is used instead.
  const fromPage = (sku) => {
    const seen = onPage[sku] || {};
    const item = { name: seen.name };
    for (const [key, value] of Object.entries(sku === own ? fromLdJson() : {}))
      if (value) item[key] = value;
    return item.name ? Object.assign(item, { sku, via: 'page' }) : null;
  };
  const wanted = skus.slice(0, 60);
  const items = [];
  for (let i = 0; i < wanted.length; i += 4) {
    const batch = await Promise.all(wanted.slice(i, i + 4).map(fetchOne));
    batch.forEach((item, j) => {
      const sku = wanted[i + j];
      const found = item || fromPage(sku);
      if (!found) return;
      if (onPage[sku] && onPage[sku].text) found.pageText = onPage[sku].text;
      items.push(found);
    });
  }
  if (!items.length) {
    say('aldi.ie didn’t send the product details. Reload the page and try again.');
    return;
  }
  const data = { v: 1, page: location.href, more: skus.length > wanted.length, items };
  location.href = app + '#/aldi?d=' + encodeURIComponent(JSON.stringify(data));
})();
