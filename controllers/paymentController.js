const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Duitku Config (Sandbox)
const merchantCode = 'DS27488';
const apiKey = '6220a7f33100ceb831075434850bf086';
// FIXED URL: sandbox.duitku.com (hapus 'passport-')
const passportUrl = 'https://sandbox.duitku.com/webapi';

// Create Transaction
const createTransaction = async (req, res) => {
    const { orderId, amount, paymentMethod } = req.body;

    if (!orderId || !amount) {
        return res.status(400).json({ success: false, message: 'Missing orderId or amount' });
    }

    try {
        const merchantOrderId = orderId.toString(); // Ensure string
        const signature = crypto.createHash('md5')
            .update(merchantCode + merchantOrderId + amount + apiKey)
            .digest('hex');

        // KONFIGURASI TESTING (Hybrid Localhost + Tunnel)
        // 1. URL Publik untuk Callback Duitku (Server to Server) - WAJIB PUBLIK
        const TUNNEL_URL = 'https://slick-lies-appear.loca.lt'; // URL dari User

        // 2. URL Lokal untuk Redirect User (Browser) - Boleh Localhost
        // Kita ambil dari origin yg dikirim PWA (misal: localhost:3001) atau fallback ke host backend
        const userReturnUrl = req.body.origin || `http://${req.headers.host}`;

        const payload = {
            merchantCode: merchantCode,
            paymentAmount: amount,
            merchantOrderId: merchantOrderId,
            productDetails: "Pembayaran Order #" + merchantOrderId,
            email: "default@mail.com",
            paymentMethod: "LQ", // LinkAja (Verified from Screenshot)
            merchantUserInfo: "cust",
            customerVaName: "Customer",
            phoneNumber: "08123456789",
            itemDetails: [{
                name: "Order #" + merchantOrderId,
                price: amount,
                quantity: 1
            }],
            // CALLBACK: Tembak ke Tunnel (biar nyampe ke backend lokal kita)
            callbackUrl: `${TUNNEL_URL}/api/payment/callback`,

            // RETURN: Balikin user ke PWA Localhost dia
            returnUrl: `${userReturnUrl}/order`,

            signature: signature,
            expiryPeriod: 15
        };

        // Call Duitku API
        const response = await fetch(`${passportUrl}/api/merchant/v2/inquiry`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.statusCode === "00") {
            // Success
            res.json({
                success: true,
                data: {
                    paymentUrl: result.paymentUrl,
                    qrString: result.qrString, // Sometimes available for QR
                    reference: result.reference
                }
            });
        } else {
            console.error("Duitku Error:", result);
            res.status(400).json({ success: false, message: result.statusMessage });
        }

    } catch (error) {
        console.error("Payment Error:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// Callback Handler
const handleCallback = async (req, res) => {
    // Duitku sends form-urlencoded usually, but let's check
    const { merchantCode: mCode, amount, merchantOrderId, signature, resultCode } = req.body;

    // Validate Signature: MD5(merchantCode + amount + merchantOrderId + apiKey)
    const calcSignature = crypto.createHash('md5')
        .update(merchantCode + amount + merchantOrderId + apiKey)
        .digest('hex');

    if (signature !== calcSignature) {
        return res.status(400).send("Bad Signature");
    }

    if (resultCode === "00") {
        // Success payment
        try {
            await prisma.order.update({
                where: { transactionCode: merchantOrderId }, // Assuming orderId matches transactionCode
                data: { paymentStatus: 'Paid' }
            });
            console.log(`Order ${merchantOrderId} marked as Paid via Duitku.`);

            // Emit socket event if needed for realtime update on dashboard
            if (req.io) {
                // req.io.emit('order_update', { transactionCode: merchantOrderId, status: 'Paid' });
                // Better scoped? For now global is fine or store-scoped if we fetch storeId first
                // Skipping complex scope for now to ensure reliability
            }

        } catch (e) {
            console.error("DB Update Error", e);
        }
    }

    res.send("OK");
};

module.exports = {
    createTransaction,
    handleCallback
};
