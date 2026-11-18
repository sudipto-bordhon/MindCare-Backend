import app from './app';
import { PORT } from './config';

import  os from "os";

app.get('/', (req, res) => {
  res.send('MindCare Backend Server is running!');
});

/* app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Backend Server Started!");
  console.log(`Local: http://localhost:${PORT}`);

  const interfaces = os.networkInterfaces() as Record<
    string,
    Array<{ family: string; internal: boolean; address: string }> | undefined
  >;

  Object.values(interfaces).flat().forEach((item) => {
    if (item && item.family === "IPv4" && !item.internal) {
      console.log(`Network: http://${item.address}:${PORT}`);
    }
  });
}); */
