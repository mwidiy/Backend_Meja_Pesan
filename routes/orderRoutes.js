const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

// POST /api/orders
// POST /api/orders (Buat Pesanan)
router.post('/', orderController.createOrder);

// GET /api/orders (Ambil Semua Pesanan)
router.get('/', orderController.getAllOrders);

// PUT /api/orders/:id/status (Update Status & Payment)
router.put('/:id/status', orderController.updateOrderStatus);

// GET /api/orders/:id (Ambil detail pesanan)
router.get('/:id', orderController.getOrderById);

// GET /api/orders/code/:code (Ambil pesanan by Transaction Code)
router.get('/code/:code', orderController.getOrderByTransactionCode);

module.exports = router;
