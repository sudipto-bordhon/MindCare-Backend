import express from 'express';
import dns from'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import apiRoutes from './routes';

const app = express();
const corsOrigins = new Set(
  (process.env.CORS_ORIGINS || 'https://mindcare-frontend-ochre.vercel.app,http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean),
);
app.get("/", (req, res) => {
  res.send("MindCare Backend Server is running!");
});
app.use(express.json({ limit: '18mb' }));
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && corsOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(origin && !corsOrigins.has(origin) ? 403 : 204);
  return next();
});

app.use('/api', apiRoutes);
app.use('/api', (req, res) => {
  res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.path}` });
});

export default app;
