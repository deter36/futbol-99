const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.env.PORT || 8765);

const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml; charset=utf-8'
};

const server = http.createServer((req, res) => {
    const requestPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
    const relativePath = requestPath === '/' ? 'index.html' : requestPath.slice(1);
    const filePath = path.resolve(root, relativePath);

    if (!filePath.startsWith(root)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (error, data) => {
        if (error) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }

        res.writeHead(200, {
            'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
        });
        res.end(data);
    });
});

server.listen(port, '127.0.0.1', () => {
    console.log(`Futbol '99 running at http://127.0.0.1:${port}/`);
});
