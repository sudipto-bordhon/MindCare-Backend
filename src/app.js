import express from 'express';
import cors from 'cors';
import apiRoutes from './routes/index.js';
import { connectDB } from './models/database.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '18mb' }));

// MongoDB connection
await connectDB().catch(error => {
  console.error('MongoDB startup connection failed:', error.message);
});

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