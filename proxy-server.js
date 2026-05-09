/**
 * Famelo v8 — Local CORS Proxy Server
 * Runs on http://localhost:3111
 * Start with: node proxy-server.js
 */
const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 3111;

const ALLOWED_HOSTS = [
  'text.pollinations.ai',
  'openrouter.ai',
  'generativelanguage.googleapis.com',
  'api.groq.com',
  'api-inference.huggingface.co',
  'api.together.xyz',
  'api.mistral.ai',
];

const server = http.createServer((req, res) => {
  // CORS headers — allow any origin (browser)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, HTTP-Referer, X-Title, x-goog-api-key');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Expect path like: /proxy?url=https://api.groq.com/...
  const parsed = url.parse(req.url, true);
  const target = parsed.query.url;

  if (!target) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: 'Missing ?url= parameter' }));
    return;
  }

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch (e) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: 'Invalid target URL: ' + e.message }));
    return;
  }

  // Security: only proxy allowed AI hosts
  if (!ALLOWED_HOSTS.some(h => targetUrl.hostname === h || targetUrl.hostname.endsWith('.' + h))) {
    res.writeHead(403);
    res.end(JSON.stringify({ error: 'Host not allowed: ' + targetUrl.hostname }));
    return;
  }

  // Forward headers (strip hop-by-hop headers)
  const forwardHeaders = {};
  for (const [key, val] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if (['host', 'connection', 'transfer-encoding', 'te', 'upgrade', 'keep-alive', 'proxy-authorization', 'proxy-authenticate', 'trailer'].includes(lower)) continue;
    forwardHeaders[key] = val;
  }
  forwardHeaders['host'] = targetUrl.hostname;

  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
    path: targetUrl.pathname + (targetUrl.search || ''),
    method: req.method,
    headers: forwardHeaders,
  };

  const lib = targetUrl.protocol === 'https:' ? https : http;

  const proxyReq = lib.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, {
      'Content-Type': proxyRes.headers['content-type'] || 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy request error:', err.message);
    if (!res.headersSent) {
      res.writeHead(502);
      res.end(JSON.stringify({ error: 'Proxy error: ' + err.message }));
    }
  });

  req.pipe(proxyReq, { end: true });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n✅ Famelo CORS Proxy running at http://localhost:${PORT}`);
  console.log(`   Leave this window open while using the app.\n`);
});
