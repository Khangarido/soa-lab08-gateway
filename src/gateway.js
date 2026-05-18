require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { createProxyMiddleware } = require('http-proxy-middleware');
const Redis = require('ioredis');

const app = express();
const PORT = process.env.PORT || 3000;
const JSON_SERVICE_URL = process.env.JSON_SERVICE_URL || 'http://localhost:8081';
const SOAP_SERVICE_URL = process.env.SOAP_SERVICE_URL || 'http://localhost:8080';
const FILE_SERVICE_URL = process.env.FILE_SERVICE_URL || 'http://localhost:8082';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const redis = new Redis(REDIS_URL, { lazyConnect: true, enableOfflineQueue: false });
redis.connect().catch(() => console.warn('[REDIS] Could not connect - caching disabled'));
redis.on('error', () => {});

app.use(cors());
app.use(morgan(':method :url :status :response-time ms'));
app.use(express.json());

app.get('/health', async (req, res) => {
  let redisOk = false;
  try { await redis.ping(); redisOk = true; } catch (_) {}
  res.json({
    status: 'OK',
    gateway: true,
    redis: redisOk,
    services: { json: JSON_SERVICE_URL, soap: SOAP_SERVICE_URL, files: FILE_SERVICE_URL },
    timestamp: new Date().toISOString()
  });
});

const cacheMiddleware = async (req, res, next) => {
  if (req.method !== 'GET') return next();
  const key = req.originalUrl;
  try {
    const cached = await redis.get(key);
    if (cached) {
      console.log('[CACHE HIT]  ' + key);
      res.setHeader('X-Cache', 'HIT');
      return res.json(JSON.parse(cached));
    }
    console.log('[CACHE MISS] ' + key);
    res.setHeader('X-Cache', 'MISS');
    const originalJson = res.json.bind(res);
    res.json = (data) => { redis.setex(key, 60, JSON.stringify(data)).catch(() => {}); return originalJson(data); };
  } catch (_) {}
  next();
};

app.use('/api/users', cacheMiddleware, createProxyMiddleware({
  target: JSON_SERVICE_URL, changeOrigin: true,
  pathRewrite: { '^/api/users': '/users' },
  on: { error: (err, req, res) => res.status(502).json({ error: 'JSON service unavailable' }) }
}));

app.use('/api/soap', createProxyMiddleware({
  target: SOAP_SERVICE_URL, changeOrigin: true,
  pathRewrite: { '^/api/soap': '' },
  on: { error: (err, req, res) => res.status(502).json({ error: 'SOAP service unavailable' }) }
}));

app.use('/api/files', cacheMiddleware, createProxyMiddleware({
  target: FILE_SERVICE_URL, changeOrigin: true,
  pathRewrite: { '^/api/files': '/files' },
  on: { error: (err, req, res) => res.status(502).json({ error: 'File service unavailable' }) }
}));

app.listen(PORT, () => {
  console.log('[GATEWAY] Running on port ' + PORT);
  console.log('[GATEWAY] JSON  -> ' + JSON_SERVICE_URL);
  console.log('[GATEWAY] SOAP  -> ' + SOAP_SERVICE_URL);
  console.log('[GATEWAY] FILES -> ' + FILE_SERVICE_URL);
});