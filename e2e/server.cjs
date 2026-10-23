// Serves the built app at http://127.0.0.1:4173/sanso/ inside the test container.
const fs = require('fs');
const http = require('http');
const path = require('path');

const DIST = '/dist';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};

function start() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (!url.pathname.startsWith('/sanso/')) {
        res.writeHead(302, { Location: '/sanso/' });
        res.end();
        return;
      }
      let file = path.normalize(
        path.join(DIST, url.pathname.slice('/sanso/'.length) || 'index.html'),
      );
      if (!file.startsWith(DIST)) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory())
        file = path.join(DIST, 'index.html');
      res.writeHead(200, {
        'Content-Type': types[path.extname(file)] ?? 'application/octet-stream',
      });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(4173, '127.0.0.1', () => resolve(server));
  });
}

module.exports = { start };
