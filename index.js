require('dotenv').config(); // Load environment variables dari .env
const express = require('express');
const cors = require('cors');
const http = require('http'); // Import HTTP
const { Server } = require("socket.io"); // Import Socket.IO
const productRoutes = require('./routes/productRoutes');
const bannerRoutes = require('./routes/bannerRoutes');

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
app.use(cors({
  // CORS Otomatis: Izinkan Localhost & Semua IP 192.168.x.x (Local Network)
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, or Postman)
    if (!origin) return callback(null, true);

    // Allow localhost and any 192.168.*.*
    if (origin.match(/^http:\/\/localhost/) || origin.match(/^http:\/\/192\.168\./)) {
      return callback(null, true);
    }

    // Default: Block foreign origins (optional: allow all for dev)
    // callback(new Error('Not allowed by CORS'));
    callback(null, true); // Fallback: Allow all (Dev Mode)
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));
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
app.use('/api/locations', require('./routes/locationRoutes'));
app.use('/api/tables', require('./routes/tableRoutes'));
app.use('/api/banners', bannerRoutes);
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/store', require('./routes/storeRoutes'));
app.use('/api/auth', require('./routes/authRoutes')); // NEW: Google Login Route

// --- MENJALANKAN SERVER ---
// Ganti app.listen jadi server.listen
server.listen(PORT, () => {
  console.log(`✅ Server berjalan di http://localhost:${PORT}`);
});