const express = require('express');
const cors = require('cors');
const app = express();
const port = 3000; // Port pintu masuk backend

// Middleware (Agar bisa baca JSON dari Kotlin/Next.js)
app.use(cors());
app.use(express.json());

// Rute Cek Kesehatan (Ping Test)
app.get('/', (req, res) => {
  res.send('Backend Skripsi Berjalan Lancar! 🚀');
});

// Contoh Rute API untuk Kasir/PWA nanti
app.get('/api/test', (req, res) => {
  res.json({
    message: "Ini data dari backend",
    status: "success",
    waktu: new Date()
  });
});

// Jalankan Server
app.listen(port, () => {
  console.log(`Server nyala di http://localhost:${port}`);
});