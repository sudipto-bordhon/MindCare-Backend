import express from 'express';
import dns from 'node:dns';
import cors from 'cors';

dns.setServers(['8.8.8.8', '1.1.1.1']);

const app = express();
app.use(cors());

/* const allowedOrigins = new Set(
  'https://mindcare-frontend-ochre.vercel.app,http://localhost:5173,http://127.0.0.1:5173'
    .split(',')
    .map(origin => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean)
); */

// CORS middleware
/* app.use((req, res, next) => {
  const origin = req.headers.origin?.replace(/\/+$/, '');

  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');

    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    );

    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, x-admin-token'
    );
  }

  if (req.method === 'OPTIONS') {
    if (origin && !allowedOrigins.has(origin)) {
      return res.status(403).json({ error: 'Origin not allowed' });
    }

    return res.sendStatus(204);
  }

  next();
}); */

// JSON middleware
app.use(express.json({ limit: '18mb' }));



/* app.use('/api', (req, res) => {
  res.status(404).json({
    error: `API endpoint not found: ${req.method} ${req.path}`,
  });
}); */

export default app;