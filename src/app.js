import express from 'express';
import cors from 'cors';
import apiRoutes from './routes/index.js';
import {connectDB} from './models/database.js';

const app = express();
connectDB(); // Connect to the database

app.use(cors());
app.use(express.json({ limit: '18mb' }));

// Root route
app.get('/', (req, res) => {
  res.send('MindCare Backend Server is running!');
});

// API routes
app.use('/api', apiRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint not found: ${req.method} ${req.path}`,
  });
});

export default app;