import app from './app.js';
import { PORT } from './config.js';

import os from 'os';

app.get('/', (req, res) => {
  res.send('MindCare Backend Server is running!');
});

/* app.listen(PORT, "0.0.0.0", () => {
  console.log(`MindCare Backend running on port ${PORT}`);
});
*/