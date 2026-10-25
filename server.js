// Dependency-free local server: serves the app and stores the data in data.json.
// Usage: node server.js   (port via PORT=xxxx)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DIR = __dirname;
const DATA = path.join(DIR, 'data.json');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const STATIC = new Set(['/index.html', '/calc.js', '/i18n.js', '/money.js']);

http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/api/data' && req.method === 'GET') {
    fs.readFile(DATA, 'utf8', (err, txt) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(err ? 'null' : txt);
    });
  } else if (url === '/api/data' && req.method === 'PUT') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 5e6) req.destroy(); });
    req.on('end', () => {
      try { JSON.parse(body); } catch (e) { res.writeHead(400); return res.end('Invalid JSON'); }
      const tmp = DATA + '.tmp';
      fs.writeFile(tmp, body, err => {
        if (err) { res.writeHead(500); return res.end('error'); }
        fs.rename(tmp, DATA, err2 => { res.writeHead(err2 ? 500 : 204); res.end(); });
      });
    });
  } else if (req.method === 'GET' && (url === '/' || STATIC.has(url))) {
    const file = url === '/' ? '/index.html' : url;
    fs.readFile(path.join(DIR, file), (err, buf) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] });
      res.end(buf);
    });
  } else { res.writeHead(404); res.end(); }
}).listen(PORT, '127.0.0.1', () => console.log(`Ready: http://localhost:${PORT}  (data in ${DATA})`));
