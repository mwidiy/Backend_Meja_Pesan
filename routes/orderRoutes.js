const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

// POST /api/orders
// POST /api/orders/batch (Ambil Banyak Pesanan)
router.post('/batch', orderController.getOrdersByBatch);

// POST /api/orders (Buat Pesanan)
router.post('/', orderController.createOrder);

// GET /api/orders (Ambil Semua Pesanan)
router.get('/', orderController.getAllOrders);

// PUT /api/orders/:id/status (Update Status & Payment)
router.put('/:id/status', orderController.updateOrderStatus);

// GET /api/orders/:id (Ambil detail pesanan)
router.get('/:id', orderController.getOrderById);

// GET /api/orders/code/:code (Ambil pesanan by Transaction Code)
// GET /api/orders/code/:code (Ambil pesanan by Transaction Code)
router.get('/code/:code', orderController.getOrderByTransactionCode);

// --- CANCELLATION & REFUND ROUTING ---
// POST /api/orders/cancel (Request/Auto Cancel dari User)
router.post('/cancel', orderController.requestCancel);

// PUT /api/orders/:id/cancel-approve (Admin Approve)
router.put('/:id/cancel-approve', orderController.approveCancel);

// PUT /api/orders/:id/cancel-reject (Admin Reject)
router.put('/:id/cancel-reject', orderController.rejectCancel);

// POST /api/orders/refund-verify (Scan Refund QR)
router.post('/refund-verify', orderController.verifyRefund);

module.exports = router;
