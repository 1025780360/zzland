// 本地静态预览服务器。打开 http://127.0.0.1:5188/?mock=1 可看到模拟的分析结果。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, join, normalize } from 'node:path';

const webRoot = fileURLToPath(new URL('../web/', import.meta.url));
const port = Number(process.env.PORT || 5188);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  let filePath = normalize(join(webRoot, decodeURIComponent(url.pathname)));

  if (!filePath.startsWith(normalize(webRoot))) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  if (url.pathname.endsWith('/')) filePath = join(filePath, 'index.html');

  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      'content-type': MIME[extname(filePath)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`本地预览: http://127.0.0.1:${port}`);
  console.log(`模拟分析: http://127.0.0.1:${port}/?mock=1`);
});
