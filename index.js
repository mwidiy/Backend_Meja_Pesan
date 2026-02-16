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
app.use((req, res, next) => {
  console.log(`[GLOBAL_LOG] ${req.method} ${req.url}`);
  next();
});

app.use(cors({
  // CORS Otomatis: Izinkan Localhost & Semua IP 192.168.x.x (Local Network)
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, or Postman)
    if (!origin || origin === 'null') return callback(null, true);

    // Allow localhost and any 192.168.*.*
    if (origin.match(/^http:\/\/localhost/) || origin.match(/^http:\/\/192\.168\./)) {
      return callback(null, true);
    }

    // Fallback: Allow all (Dev Mode - Safe for internal network)
    return callback(null, true);
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));
app.use(express.json({ limit: '50mb' })); // Supaya bisa baca data JSON besar
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// app.use(express.static('public')); // MOVED DOWN: Static must be AFTER custom logic to prevent shadowing
// app.use('/uploads', express.static('public/images')); // MOVED DOWN

// DEBUG: Ultimate Serving with res.sendFile
app.use('/ar-assets', (req, res, next) => {
  const requestPath = decodeURIComponent(req.path);
  const cleanRequestPath = requestPath.replace(/^\//, '');
  const filePath = require('path').join(__dirname, 'public', 'ar-assets', cleanRequestPath);

  console.log(`[AR_DEBUG] ${req.method} Request: '${req.originalUrl}'`);
  console.log(`[AR_DEBUG] Target Path: '${filePath}'`);

  // Handle CORS Preflight explicitly for this route
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (require('fs').existsSync(filePath)) {
    // Check if it's a file
    if (require('fs').statSync(filePath).isDirectory()) {
      console.log(`[AR_DEBUG] REJECT: It is a directory.`);
      return res.status(404).send('Not a file');
    }

    // EXPLICIT MIME TYPES (Critical for Mobile/Model-Viewer)
    if (filePath.endsWith('.glb')) {
      res.setHeader('Content-Type', 'model/gltf-binary');
    } else if (filePath.endsWith('.gltf')) {
      res.setHeader('Content-Type', 'model/gltf+json');
    }
    // Disable Cache for debugging to prevent stale 404s
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    console.log(`[AR_DEBUG] Sending File via res.sendFile...`);
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error(`[AR_DEBUG] SendFile Error:`, err);
        if (!res.headersSent) res.status(404).send('Failed to send file');
      } else {
        console.log(`[AR_DEBUG] Success: File sent to client.`);
      }
    });
  } else {
    console.log(`[AR_DEBUG] 404 Not Found (Disk Check Failed)`);
    res.status(404).send('File not found');
  }
});

// --- STATIC SERVING (MUST BE AFTER CUSTOM AR LOGIC) ---
app.use(express.static('public'));
app.use('/uploads', express.static('public/images'));

// Middleware agar io bisa dipakai di controller
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Log ketika ada client connect
io.on('connection', (socket) => {
  console.log(`⚡ Client connected: ${socket.id}`);

  // Client (PWA/Android) join specific Store Room
  socket.on('join_store', (storeId) => {
    if (storeId) {
      const roomName = `store_${storeId}`;
      socket.join(roomName);
      console.log(`🔌 Socket ${socket.id} joined room: ${roomName}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

// --- IGNORE FAVICON (Stop 404 noise) ---
app.get('/favicon.ico', (req, res) => res.status(204).end());

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
app.use('/api/ar', require('./routes/arRoutes'));
app.use('/api/store', require('./routes/storeRoutes'));
app.use('/api/auth', require('./routes/authRoutes')); // NEW: Google Login Route
app.use('/api/payment', require('./routes/paymentRoutes')); // Duitku Payment
app.use('/api/withdraw', require('./routes/withdrawalRoutes')); // NEW: Withdrawal

// --- MENJALANKAN SERVER ---
// Ganti app.listen jadi server.listen
server.listen(PORT, () => {
  console.log(`✅ Server berjalan di http://localhost:${PORT}`);
});