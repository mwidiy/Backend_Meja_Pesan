const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { identifyStore } = require('../middleware/authMiddleware');
const crypto = require('crypto');
const SECRET_KEY = process.env.WITHDRAWAL_SECRET_KEY || 'default_secret_key';
const WEBHOOK_URL = process.env.PAKASIR_WEBHOOK_URL || 'http://localhost:3000';

// Helper: Calculate Balance
const calculateBalance = async (storeId) => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

    // 1. Cold Income (Paid > 24h ago) -> AVAILABLE for Withdrawal
    const coldIncomeAgg = await prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: {
            storeId: storeId,
            paymentMethod: 'qris',
            paymentStatus: { equals: 'Paid', mode: 'insensitive' },
            status: { not: 'Cancelled' },
            createdAt: { lte: yesterday } // Older than 24h
        }
    });
    const coldIncome = coldIncomeAgg._sum.totalAmount || 0;

    // 2. Hot Income (Paid <= 24h ago) -> PENDING Settlement
    const hotIncomeAgg = await prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: {
            storeId: storeId,
            paymentMethod: 'qris',
            paymentStatus: { equals: 'Paid', mode: 'insensitive' },
            status: { not: 'Cancelled' },
            createdAt: { gt: yesterday } // Newer than 24h
        }
    });
    const hotIncome = hotIncomeAgg._sum.totalAmount || 0;

    // 3. Total Withdrawals (Pending + Approved)
    // Withdrawals reduce the AVAILABLE (Cold) balance.
    const totalWithdrawalAgg = await prisma.withdrawal.aggregate({
        _sum: { amount: true },
        where: {
            storeId: storeId,
            status: { in: ['Pending', 'Approved'] }
        }
    });
    const totalWithdrawn = totalWithdrawalAgg._sum.amount || 0;

    const availableBalance = coldIncome - totalWithdrawn;

    return {
        available: availableBalance > 0 ? availableBalance : 0, // Prevent negative if logic drift
        pendingSettlement: hotIncome,
        totalWithdrawn
    };
};

// GET /api/withdraw/balance
const getBalance = async (req, res) => {
    try {
        const storeId = identifyStore(req);
        if (!storeId) return res.status(400).json({ error: 'User tidak memiliki akses Toko' });

        const balances = await calculateBalance(storeId);
        res.json({
            success: true,
            balance: balances.available, // Maintain 'balance' for backwards compatibility
            availableBalance: balances.available,
            pendingSettlement: balances.pendingSettlement
        });
    } catch (error) {
        console.error("Get Balance Error:", error);
        res.status(500).json({ error: "Failed to fetch balance" });
    }
};

// POST /api/withdraw/request
const requestWithdrawal = async (req, res) => {
    try {
        const storeId = identifyStore(req);
        if (!storeId) return res.status(400).json({ error: 'User tidak memiliki akses Toko' });

        const { amount, method } = req.body; // method: "Bank" or "ShopeePay"

        if (!amount || amount <= 0) {
            return res.status(400).json({ error: "Nominal penarikan tidak valid" });
        }

        // 1. Cek Saldo Cukup (ONLY AVAILABLE BALANCE)
        const balances = await calculateBalance(storeId);
        if (amount > balances.available) {
            return res.status(400).json({
                error: "Saldo Saldo Cair tidak mencukupi (Cek Saldo Tertahan)"
            });
        }

        // 2. Ambil Info Bank dari Store untuk Snapshot
        const store = await prisma.store.findUnique({ where: { id: storeId } });

        let targetBankName, targetAccountNumber, targetAccountName, withdrawalMethod;

        if (method === "ShopeePay") {
            if (!store.ewalletNumber || !store.ewalletName) {
                return res.status(400).json({ error: "Data E-Wallet belum lengkap di profil" });
            }
            targetBankName = store.ewalletType || "E-Wallet"; // Dynamic Type
            targetAccountNumber = store.ewalletNumber;
            targetAccountName = store.ewalletName;
            withdrawalMethod = "E-Wallet";
        } else {
            // Default to Bank
            if (!store.bankName || !store.bankNumber || !store.bankHolder) {
                return res.status(400).json({ error: "Data Bank belum lengkap di profil" });
            }
            targetBankName = store.bankName;
            targetAccountNumber = store.bankNumber;
            targetAccountName = store.bankHolder;
            withdrawalMethod = "Bank Transfer";
        }

        // 3. Buat Request
        const withdrawal = await prisma.withdrawal.create({
            data: {
                storeId,
                amount: parseInt(amount),
                method: withdrawalMethod,
                status: "Pending",
                bankName: targetBankName,
                accountNumber: targetAccountNumber,
                accountName: targetAccountName
            }
        });

        // 4. Send Telegram Notification (With One-Click Action)
        const tokenApprove = crypto.createHmac('sha256', SECRET_KEY).update(`${withdrawal.id}approve`).digest('hex');
        const tokenReject = crypto.createHmac('sha256', SECRET_KEY).update(`${withdrawal.id}reject`).digest('hex');

        const linkApprove = `${WEBHOOK_URL}/api/withdraw/process?id=${withdrawal.id}&action=approve&token=${tokenApprove}`;
        const linkReject = `${WEBHOOK_URL}/api/withdraw/process?id=${withdrawal.id}&action=reject&token=${tokenReject}`;

        const message = `
<b>🔔 NEW WITHDRAWAL!</b>
Method: ${withdrawalMethod}
User: ${targetAccountName}
Bank/E-Wallet: ${targetBankName} - ${targetAccountNumber}
Jumlah: Rp ${new Intl.NumberFormat('id-ID').format(withdrawal.amount)}

👇 <b>KLIK UNTUK PROSES:</b>
<a href="${linkApprove}">✅ ACC SEKARANG</a>
<a href="${linkReject}">❌ TOLAK</a>
        `;

        // Panggil fungsi tanpa await agar tidak memblokir response jika koneksi lambat
        const { sendTelegramNotification } = require('../utils/telegramBot');
        sendTelegramNotification(message);

        res.json({ success: true, data: withdrawal });
    } catch (error) {
        console.error("Withdrawal Request Error:", error);
        res.status(500).json({ error: "Failed to create withdrawal request" });
    }
};

// GET /api/withdraw/history
const getHistory = async (req, res) => {
    try {
        const storeId = identifyStore(req);
        if (!storeId) return res.status(400).json({ error: 'User tidak memiliki akses Toko' });

        const history = await prisma.withdrawal.findMany({
            where: { storeId },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ success: true, data: history });
    } catch (error) {
        console.error("Withdraw History Error:", error);
        res.status(500).json({ error: "Failed to fetch history" });
    }
};

// GET & POST /api/withdraw/process
const processWithdrawal = async (req, res) => {
    try {
        // Handle GET: Return Auto-Submit Form (Prevents Link Preview Execution)
        if (req.method === 'GET') {
            const { id, action, token } = req.query;
            console.log("GET Process Query:", req.query); // DEBUG LOG

            if (!id || !action || !token) {
                return res.send('Invalid Request parameters');
            }

            return res.send(`
                <html>
                    <body onload="document.getElementById('form').submit()" style="text-align:center; padding:50px; font-family:sans-serif;">
                        <h2>Memproses Permintaan...</h2>
                        <form id="form" action="/api/withdraw/process" method="POST">
                            <input type="hidden" name="id" value="${id}" />
                            <input type="hidden" name="action" value="${action}" />
                            <input type="hidden" name="token" value="${token}" />
                            <noscript>
                                <button type="submit" style="padding:10px 20px; font-size:16px; cursor:pointer;">Klik untuk Lanjutkan</button>
                            </noscript>
                        </form>
                    </body>
                </html>
            `);
        }

        // Handle POST: Execute Logic
        console.log("POST Process Body:", req.body); // DEBUG LOG
        const { id, token } = req.body;
        let { action } = req.body;

        if (!id || !action || !token) {
            return res.send('Invalid Request parameters');
        }

        action = action.toLowerCase();

        // 1. Validate Token (Security)
        const expectedToken = crypto.createHmac('sha256', SECRET_KEY).update(`${id}${action}`).digest('hex');

        if (token !== expectedToken) {
            return res.status(403).send('<h1 style="color:red">⛔ ACCESS DENIED: Invalid Token</h1>');
        }

        // 2. Update Database
        const stats = action === 'approve' ? 'Approved' : 'Rejected';

        // Find existing to check if already processed
        const existing = await prisma.withdrawal.findUnique({ where: { id: parseInt(id) } });
        if (!existing) return res.send('Transaction not found');
        if (existing.status !== 'Pending') {
            // Already processed
            const color = existing.status === 'Approved' ? 'green' : 'red';
            return res.send(`
                <html>
                    <body style="text-align:center; font-family:sans-serif; padding:50px;">
                        <h1 style="color:${color}">⚠️ Transaksi Sudah ${existing.status}</h1>
                        <p>ID: #${id}</p>
                    </body>
                </html>
            `);
        }

        await prisma.withdrawal.update({
            where: { id: parseInt(id) },
            data: { status: stats }
        });

        // 3. Return Simple HTML Response
        const color = action === 'approve' ? 'green' : 'red';
        const msg = action === 'approve' ? '✅ BERHASIL DI-APPROVE!' : '❌ SUKSES DITOLAK!';

        res.send(`
            <html>
                <body style="text-align:center; font-family:sans-serif; padding:50px; background-color:#f4f4f9;">
                    <div style="background:white; padding:20px; border-radius:10px; box-shadow:0 4px 6px rgba(0,0,0,0.1); display:inline-block;">
                        <h1 style="color:${color}">${msg}</h1>
                        <p>ID Transaksi: <b>#${id}</b></p>
                        <p>Status sekarang: <b>${stats}</b></p>
                        <hr>
                        <small>Anda bisa menutup halaman ini.</small>
                    </div>
                </body>
            </html>
        `);

    } catch (error) {
        console.error("Process Withdrawal Error:", error);
        res.status(500).send("Internal Server Error");
    }
};

module.exports = {
    getBalance,
    requestWithdrawal,
    getHistory,
    processWithdrawal
};
