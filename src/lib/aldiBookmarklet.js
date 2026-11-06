(async () => {
  const app = '__SANSO_APP__';
  const say = (message) => alert('Sanso: ' + message);
  if (!/(^|\.)aldi\.ie$/.test(location.hostname)) {
    say('open a product, offers or search page on aldi.ie first, then run this again.');
    return;
  }
  const skuOf = (path) => (/\/product\/[^/]*-(\d{6,18})\/?$/.exec(path) || [])[1];
  const skus = [];
  const own = skuOf(location.pathname);
  if (own) skus.push(own);
  else
    for (const link of document.querySelectorAll('a[href*="/product/"]')) {
      const sku = skuOf(new URL(link.href, location.href).pathname);
      if (sku && !skus.includes(sku)) skus.push(sku);
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
  const fromPage = () => {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const found = [].concat(JSON.parse(script.textContent));
        const product = found.find((item) => item && /Product$/.test(item['@type']));
        if (product) {
          const offer = [].concat(product.offers || [])[0] || {};
          return {
            sku: own,
            name: product.name,
            brandName: product.brand && product.brand.name,
            priceDisplay: offer.price ? String(offer.price) : undefined,
            image: [].concat(product.image || [])[0],
          };
        }
      } catch (error) {
        console.warn('Sanso:', error);
      }
    }
    return null;
  };
  const wanted = skus.slice(0, 60);
  const items = [];
  for (let i = 0; i < wanted.length; i += 4) {
    const batch = await Promise.all(wanted.slice(i, i + 4).map(fetchOne));
    items.push(...batch.filter(Boolean));
  }
  if (!items.length && own) {
    const item = fromPage();
    if (item) items.push(item);
  }
  if (!items.length) {
    say('aldi.ie didn’t send the product details. Reload the page and try again.');
    return;
  }
  const data = { v: 1, page: location.href, more: skus.length > wanted.length, items };
  location.href = app + '#/aldi?d=' + encodeURIComponent(JSON.stringify(data));
})();
