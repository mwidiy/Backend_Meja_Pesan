const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// --- PAKASIR CONFIG ---
const PAKASIR_API_KEY = process.env.PAKASIR_API_KEY;
const PAKASIR_PROJECT = process.env.PAKASIR_PROJECT_SLUG;
// Default to Prod if not set in .env
const PAKASIR_BASE_URL = process.env.PAKASIR_API_URL || 'https://app.pakasir.com/api';

// Helper to check status
const fetchTransactionStatus = async (orderId, amount) => {
    const url = `${PAKASIR_BASE_URL}/transactiondetail?project=${PAKASIR_PROJECT}&amount=${amount}&order_id=${orderId}&api_key=${PAKASIR_API_KEY}`;
    const response = await fetch(url);
    return await response.json();
};

const isSuccessStatus = (status) => {
    if (!status) return false;
    const s = status.toLowerCase();
    return s === 'success' || s === 'settlement' || s === 'completed';
};

// 1. Create Transaction (Get QR Data)
const createTransaction = async (req, res) => {
    const { orderId, amount } = req.body;

    if (!orderId || !amount) {
        return res.status(400).json({ success: false, message: 'Missing orderId or amount' });
    }

    if (!PAKASIR_PROJECT) {
        console.error("❌ PAKASIR_PROJECT_SLUG is not set in .env");
        return res.status(500).json({ success: false, message: 'Server Config Error' });
    }

    try {
        console.log(`[Pakasir] Start Transaction: Order ${orderId}, Amount: ${amount}`);

        // 1. Cek DB dulu
        const order = await prisma.order.findUnique({ where: { transactionCode: orderId.toString() } });
        if (order && order.paymentStatus === 'Paid') {
            return res.json({ success: true, status: 'Paid', message: 'Order already paid' });
        }

        const payload = {
            project: PAKASIR_PROJECT,
            order_id: orderId.toString(),
            amount: amount,
            api_key: PAKASIR_API_KEY
        };

        const response = await fetch(`${PAKASIR_BASE_URL}/transactioncreate/qris`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const text = await response.text();
        console.log("[Pakasir] Raw API Response:", text);

        let result;
        try {
            result = JSON.parse(text);
        } catch (e) {
            console.error("[Pakasir] JSON Parse Error:", e);
            throw new Error("Invalid JSON from Pakasir");
        }

        // --- HANDLING SUKSES CREATION ---
        if (result.payment && result.payment.payment_number) {
            return res.json({
                success: true,
                data: {
                    qrString: result.payment.payment_number,
                    amount: result.payment.total_payment || amount,
                    orderId: result.payment.order_id,
                    expiry: result.payment.expired_at
                }
            });
        }

        // --- HANDLING "ALREADY COMPLETED" ---
        if (result.message && result.message.toLowerCase().includes("completed")) {
            console.log("[Pakasir] Transaction exists/completed. Checking status...");
            const check = await fetchTransactionStatus(orderId, amount);
            console.log("[Pakasir] Re-check Status:", JSON.stringify(check));

            if (check.transaction && isSuccessStatus(check.transaction.status)) {
                if (order && order.paymentStatus !== 'Paid') {
                    await prisma.order.update({
                        where: { transactionCode: orderId.toString() },
                        data: { paymentStatus: 'Paid' }
                    });
                }
                return res.json({ success: true, status: 'Paid', message: 'Transaction verified as Paid' });
            } else {
                return res.json({ success: true, status: 'Pending', message: 'Transaction exists but pending' });
            }
        }

        console.error("[Pakasir] Failed:", result);
        res.status(400).json({
            success: false,
            message: result.message || 'Gagal membuat QRIS',
            details: result
        });

    } catch (error) {
        console.error("[Pakasir] Create Error:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// 2. Webhook Handler (Instant Notification)
const handleCallback = async (req, res) => {
    try {
        console.log("[Pakasir] Webhook Received:", JSON.stringify(req.body));

        // Payload: { project, order_id, amount, status, ... }
        const { order_id, status } = req.body;

        if (isSuccessStatus(status)) {
            const order = await prisma.order.findUnique({ where: { transactionCode: order_id.toString() } });

            if (order) {
                if (order.paymentStatus !== 'Paid') {
                    await prisma.order.update({
                        where: { transactionCode: order_id.toString() },
                        data: { paymentStatus: 'Paid' }
                    });
                    console.log(`[Pakasir] Order ${order_id} UPDATED to Paid (via Webhook)`);
                }

                if (req.io) {
                    req.io.emit('order_update', {
                        transactionCode: order_id,
                        status: 'Paid',
                        source: 'webhook'
                    });
                }
                return res.status(200).json({ status: 'ok', message: 'Updated to Paid' });
            } else {
                console.log(`[Pakasir] Order ${order_id} not found in DB`);
                return res.status(200).json({ status: 'ok', message: 'Order not found' });
            }
        }

        console.log(`[Pakasir] Webhook ignored (Status: ${status})`);
        res.status(200).json({ status: 'ok', message: 'Ignored' });

    } catch (error) {
        console.error("[Pakasir] Webhook Error:", error);
        res.status(200).json({ status: 'error', message: "Internal Error handled" });
    }
};

// 3. Status Polling Backup
const checkStatus = async (req, res) => {
    const { orderId } = req.params;
    const { amount } = req.query;

    if (!orderId || !amount) return res.status(400).json({ message: 'Missing params' });

    try {
        // Only log periodically or if status changes to avoid spam, 
        // but for now log every check to confirm 'completed' status
        // console.log(`[Pakasir] Polling ${orderId}...`);

        const result = await fetchTransactionStatus(orderId, amount);

        if (result.transaction && isSuccessStatus(result.transaction.status)) {
            const order = await prisma.order.findUnique({ where: { transactionCode: orderId } });
            if (order && order.paymentStatus !== 'Paid') {
                await prisma.order.update({
                    where: { transactionCode: orderId },
                    data: { paymentStatus: 'Paid' }
                });
                if (req.io) req.io.emit('order_update', { transactionCode: orderId, status: 'Paid' });
                console.log(`[Pakasir] Polling found PAID status for ${orderId}`);
            }
            return res.json({ success: true, status: 'Paid' });
        }

        res.json({ success: true, status: 'Pending', raw_status: result.transaction?.status });

    } catch (error) {
        console.error("[Pakasir] Check Status Error:", error);
        res.status(500).json({ success: false });
    }
};

module.exports = {
    createTransaction,
    handleCallback,
    checkStatus
};
