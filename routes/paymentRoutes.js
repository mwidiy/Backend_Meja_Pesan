const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

// POST /api/payment/create-transaction
router.post('/create-transaction', paymentController.createTransaction);

// POST /api/payment/callback
router.post('/callback', express.urlencoded({ extended: true }), paymentController.handleCallback);
// Note: Duitku might send body as x-www-form-urlencoded, updated middleware usage if needed. 
// Express default json body parser might not catch if content-type is form-urlencoded.
// Adding inline middleware for safety if main index doesn't have it globally (index.js usually has json, not urlencoded)

module.exports = router;
