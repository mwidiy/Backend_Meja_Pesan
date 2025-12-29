require('dotenv').config(); // Load environment variables dari .env
const express = require('express');
const cors = require('cors');
const productRoutes = require('./routes/productRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// --- MIDDLEWARE ---
app.use(cors()); // PENTING: Supaya Next.js dan Kotlin bisa akses API ini
app.use(express.json()); // Supaya bisa baca data JSON dari request body

// --- ROUTE UTAMA (CEK SERVER) ---
app.get('/', (req, res) => {
  res.send('Server Backend Kasir Siap! 🚀 Silakan akses /api/products');
});

// --- API ROUTES ---
app.use('/api/products', productRoutes);

// --- MENJALANKAN SERVER ---
app.listen(PORT, () => {
  console.log(`✅ Server berjalan di http://localhost:${PORT}`);
});