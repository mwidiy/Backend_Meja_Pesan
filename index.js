require('dotenv').config(); // Load environment variables dari .env
const express = require('express');
const cors = require('cors');
const http = require('http'); // Import HTTP
const { Server } = require("socket.io"); // Import Socket.IO
const productRoutes = require('./routes/productRoutes');

const app = express();
const server = http.createServer(app); // Bungkus app express dengan HTTP server
// Inisialisasi Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*", // Izinkan koneksi dari semua origin
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

const PORT = process.env.PORT || 3000;

// --- MIDDLEWARE ---
app.use(cors()); // PENTING: Supaya Next.js dan Kotlin bisa akses API ini
app.use(express.json()); // Supaya bisa baca data JSON dari request body
app.use('/uploads', express.static('public/images')); // Akses gambar publik

// Middleware agar io bisa dipakai di controller
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Log ketika ada client connect
io.on('connection', (socket) => {
  console.log(`⚡ Client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

// --- ROUTE UTAMA (CEK SERVER) ---
app.get('/', (req, res) => {
  res.send('Server Backend Kasir Siap! 🚀 Silakan akses /api/products');
});

// --- API ROUTES ---
app.use('/api/products', productRoutes);
app.use('/api/categories', require('./routes/categoryRoutes'));

// --- MENJALANKAN SERVER ---
// Ganti app.listen jadi server.listen
server.listen(PORT, () => {
  console.log(`✅ Server berjalan di http://localhost:${PORT}`);
});