// Stand-ins for api.github.com and aldi.ie, served through Playwright's request
// routing, so the test runs with networking off.
const crypto = require('crypto');

const json = (body, status = 200, headers = {}) => ({
  status,
  contentType: 'application/json',
  headers,
  body: JSON.stringify(body),
});

/**
 * A private repository with just enough of GitHub's git API for backups:
 * repo info, refs, commits, trees, blobs and creating a first file.
 */
function fakeGitHub({ token, repo }) {
  const blobs = new Map();
  const trees = new Map();
  const commits = new Map();
  let head = null;
  let commitCount = 0;

  const blobSha = (bytes) =>
    crypto
      .createHash('sha1')
      .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
      .digest('hex');
  const putBlob = (bytes) => {
    const sha = blobSha(bytes);
    blobs.set(sha, bytes);
    return sha;
  };
  const putTree = (files) => {
    const sha = crypto.randomBytes(20).toString('hex');
    trees.set(sha, files);
    return sha;
  };
  const putCommit = (tree, message) => {
    const sha = crypto.randomBytes(20).toString('hex');
    commits.set(sha, { tree, message, date: new Date().toISOString() });
    commitCount++;
    return sha;
  };
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type, accept',
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, OPTIONS',
  };

  async function handle(route) {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (request.headers().authorization !== `Bearer ${token}`)
      return route.fulfill(json({ message: 'Bad credentials' }, 401, cors));
    const url = new URL(request.url());
    const base = `/repos/${repo}`;
    if (!url.pathname.startsWith(base))
      return route.fulfill(json({ message: 'Not Found' }, 404, cors));
    const path = url.pathname.slice(base.length);
    const body = request.postData() ? JSON.parse(request.postData()) : {};
    const method = request.method();
    let m;

    if (path === '' && method === 'GET')
      return route.fulfill(json({ private: true, default_branch: 'main' }, 200, cors));
    if (path === '/git/ref/heads/main' && method === 'GET') {
      if (!head) return route.fulfill(json({ message: 'Git Repository is empty.' }, 409, cors));
      return route.fulfill(json({ object: { sha: head } }, 200, cors));
    }
    if (path === '/contents/README.md' && method === 'PUT') {
      const sha = putBlob(Buffer.from(body.content, 'base64'));
      head = putCommit(putTree(new Map([['README.md', sha]])), body.message);
      return route.fulfill(json({ commit: { sha: head } }, 201, cors));
    }
    if ((m = /^\/git\/commits\/(\w+)$/.exec(path)) && method === 'GET') {
      const commit = commits.get(m[1]);
      return route.fulfill(
        json({ tree: { sha: commit.tree }, committer: { date: commit.date } }, 200, cors),
      );
    }
    if ((m = /^\/git\/trees\/(\w+)$/.exec(path)) && method === 'GET') {
      const files = trees.get(m[1]);
      const tree = [...files].map(([p, sha]) => ({ path: p, sha, type: 'blob' }));
      return route.fulfill(json({ tree }, 200, cors));
    }
    if ((m = /^\/git\/blobs\/(\w+)$/.exec(path)) && method === 'GET') {
      const bytes = blobs.get(m[1]);
      return route.fulfill(
        json({ content: bytes.toString('base64'), encoding: 'base64' }, 200, cors),
      );
    }
    if (path === '/git/blobs' && method === 'POST')
      return route.fulfill(json({ sha: putBlob(Buffer.from(body.content, 'base64')) }, 201, cors));
    if (path === '/git/trees' && method === 'POST') {
      const files = new Map(trees.get(body.base_tree));
      for (const entry of body.tree) {
        if (entry.sha === null) files.delete(entry.path);
        else files.set(entry.path, entry.sha);
      }
      return route.fulfill(json({ sha: putTree(files) }, 201, cors));
    }
    if (path === '/git/commits' && method === 'POST')
      return route.fulfill(json({ sha: putCommit(body.tree, body.message) }, 201, cors));
    if (path === '/git/refs/heads/main' && method === 'PATCH') {
      head = body.sha;
      return route.fulfill(json({ object: { sha: head } }, 200, cors));
    }
    return route.fulfill(json({ message: `Not handled: ${method} ${path}` }, 404, cors));
  }

  return {
    handle,
    commits: () => commitCount,
    /** Parsed contents of a file in the latest commit, or undefined. */
    file(name) {
      if (!head) return undefined;
      const sha = trees.get(commits.get(head).tree).get(name);
      return sha ? JSON.parse(blobs.get(sha).toString('utf8')) : undefined;
    },
  };
}

// aldi.ie: an offers page, product pages, the product API and the image server.

const imageTemplate = (id) =>
  `https://dm.emea.cms.aldi.cx/is/image/aldiprodeu/product/jpg/scaleWidth/{width}/${id}/{slug}`;

const aldiProducts = {
  '000000000000282766': {
    sku: '000000000000282766',
    name: 'Penne Pasta',
    brandName: 'CUCINA',
    urlSlugText: 'cucina-penne-pasta-1kg',
    sellingSize: '1 KG',
    description: '<p>Durum wheat pasta.</p>',
    price: { amount: 99, amountRelevantDisplay: '€0.99', comparisonDisplay: '€0.99/1 KG' },
    assets: [{ url: imageTemplate('penne') }],
  },
  '000000000000300111': {
    sku: '000000000000300111',
    name: 'Irish Free Range Eggs',
    brandName: 'FARMDALE',
    urlSlugText: 'farmdale-irish-free-range-eggs-12-pack',
    sellingSize: '12 Each',
    price: { amount: 299, amountRelevantDisplay: '€2.99', comparisonDisplay: '€0.25/1 Each' },
    assets: [{ url: imageTemplate('eggs') }],
  },
  '000000000000300222': {
    sku: '000000000000300222',
    name: 'Mature Cheddar',
    brandName: 'EMPORIUM',
    urlSlugText: 'emporium-mature-cheddar',
    price: { amount: 249, amountRelevantDisplay: '€2.49', comparisonDisplay: '€6.23/1 KG' },
    assets: [{ url: imageTemplate('cheddar') }],
  },
  // The API doesn't answer for this one, so the helper has to read the page.
  '000000000000400333': {
    sku: '000000000000400333',
    name: 'Fresh Milk',
    brandName: 'COWBELL',
    urlSlugText: 'cowbell-fresh-milk',
    pageOnly: true,
    shownSize: '1 l',
    price: { amount: 115, amountRelevantDisplay: '€1.15', comparisonDisplay: '€1.15/1 L' },
  },
};

/** The product block aldi.ie shows on product pages and in product lists. */
function productBlock(p, heading) {
  const name = heading
    ? `<h1>${p.name}</h1>`
    : `<a href="${productLink(p)}">${p.brandName} ${p.name}</a>`;
  return `<div class="tile"><div>${p.brandName}</div>${name}<div>${p.shownSize ?? p.sellingSize ?? ''}</div>
    <div>${p.price.amountRelevantDisplay}</div><div>(${p.price.comparisonDisplay})</div></div>`;
}

/** Lets the test change a price, as a price drop would. */
function setAldiPrice(sku, cents, wasCents) {
  const price = aldiProducts[sku].price;
  price.amount = cents;
  price.amountRelevantDisplay = `€${(cents / 100).toFixed(2)}`;
  price.wasPriceDisplay = wasCents ? `€${(wasCents / 100).toFixed(2)}` : null;
}

const productLink = (p) => `/product/${p.urlSlugText}-${p.sku}`;

function aldiPage(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title} | ALDI.IE</title>
    <meta name="viewport" content="width=device-width"></head>
    <body style="font:16px sans-serif;padding:16px">${body}</body></html>`;
}

async function handleAldi(route) {
  const url = new URL(route.request().url());
  if (url.hostname === 'api.aldi.ie') {
    const sku = /^\/v2\/products\/(\d+)$/.exec(url.pathname)?.[1];
    const cors = { 'access-control-allow-origin': 'https://www.aldi.ie' };
    const product = aldiProducts[sku];
    return route.fulfill(
      product && !product.pageOnly ? json({ data: product }, 200, cors) : json({}, 404, cors),
    );
  }
  if (url.hostname === 'dm.emea.cms.aldi.cx') {
    const colour = /eggs/.test(url.pathname)
      ? '#e9c46a'
      : /cheddar/.test(url.pathname)
        ? '#f4a261'
        : '#d4a373';
    return route.fulfill({
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="#fff"/><rect x="60" y="40" width="200" height="240" rx="24" fill="${colour}"/></svg>`,
    });
  }
  const sku = /-(\d{6,18})$/.exec(url.pathname)?.[1];
  if (sku && aldiProducts[sku]) {
    const p = aldiProducts[sku];
    return route.fulfill({
      contentType: 'text/html',
      body: aldiPage(
        `${p.brandName} ${p.name}`,
        `<main>${productBlock(p, true)}</main><section><h2>You may also like</h2>${Object.values(
          aldiProducts,
        )
          .filter((other) => other !== p)
          .map((other) => productBlock(other, false))
          .join('')}</section>`,
      ),
    });
  }
  const links = Object.values(aldiProducts)
    .map((p) => `<li>${productBlock(p, false)}</li>`)
    .join('');
  return route.fulfill({
    contentType: 'text/html',
    body: aldiPage('Super Savers', `<h1>Super Savers</h1><ul>${links}</ul>`),
  });
}

async function installAldi(context) {
  await context.route(
    /^https:\/\/(www\.aldi\.ie|api\.aldi\.ie|dm\.emea\.cms\.aldi\.cx)\//,
    handleAldi,
  );
}

module.exports = { fakeGitHub, installAldi, setAldiPrice, aldiProducts, productLink };
