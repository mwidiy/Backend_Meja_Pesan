const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const PDFDocument = require('pdfkit-table');
// Ensure you have ran: npm install pdfkit pdfkit-table

// Helper untuk generate Transaction Code
// Format: TRX-[YYYYMMDD]-[RANDOM4DIGIT] (Contoh: TRX-20240101-A1B2)
const generateTransactionCode = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;

    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();

    return `TRX-${dateStr}-${randomStr}`;
};

const createOrder = async (req, res) => {
    try {
        console.log('Incoming Order Payload:', JSON.stringify(req.body, null, 2));

        const {
            customerName,
            tableId,
            orderType,
            items,
            note,
            deliveryAddress,
            paymentMethod,
            paymentStatus
        } = req.body;

        // 1. Validasi Input Dasar
        if (!customerName || !items || items.length === 0) {
            return res.status(400).json({ error: 'Customer name dan items harus diisi.' });
        }

        // 2. Parsed Data & Logic
        let parsedTableId = null;
        let finalOrderType = orderType;

        // FIXED LOGIC: 
        // HANYA set ke default 'Counter Pickup' JIKA req.body.tableId itu KOSONG (null/undefined).
        // 2. Parsed Data & Logic
        // AMBIL ID DARI REQUEST
        let finalTableId = req.body.tableId;
        // HANYA JIKA Table ID kosong/null, BARU kita cari meja default
        if (!finalTableId) {
            if (orderType === 'takeaway') {
                // Cari meja default takeaway (jika ada logic ini)
                // Default ke Counter Pickup sesuai logic lama
                const pickupTable = await prisma.table.findUnique({
                    where: { qrCode: 'COUNTER-PICKUP' }
                });
                if (pickupTable) {
                    finalTableId = pickupTable.id.toString();
                }
            } else if (orderType === 'delivery') {
                // Default ke Counter Pickup (atau logic lain jika ada)
                const pickupTable = await prisma.table.findUnique({
                    where: { qrCode: 'COUNTER-PICKUP' }
                });
                if (pickupTable) {
                    finalTableId = pickupTable.id.toString();
                }
            }
        }

        // If finalTableId is still not set, it means no specific table was provided and no default was found/applicable.
        // In this case, parsedTableId remains null, which is fine for orders not tied to a physical table.
        if (finalTableId) {
            parsedTableId = parseInt(finalTableId);
        }

        // 3. Logic Note Handling (Deleted - separated into note & deliveryAddress)

        // 4. Hitung Total Amount dari items & Siapkan Data Items
        let calculatedTotal = 0;
        const orderItemsData = items.map(item => {
            const itemTotal = item.price * item.quantity;
            calculatedTotal += itemTotal;
            return {
                productId: item.productId,
                quantity: item.quantity,
                priceSnapshot: item.price, // Harga saat checkout
                // note: item.note
            };
        });

        // 5. Generate Transaction Code Unik
        const transactionCode = generateTransactionCode();

        // --- SMART QUEUE LOGIC START ---
        // 1. Fetch products to get prepTime
        const productIds = items.map(item => item.productId);
        const products = await prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, prepTime: true, name: true }
        });

        const prepMap = {};
        products.forEach(p => prepMap[p.id] = p.prepTime || 5); // Default 5 mins

        // 2. Determine Lane
        let maxPrepTime = 0;
        let isFastLane = true;
        items.forEach(item => {
            const pt = prepMap[item.productId];
            if (pt > 5) isFastLane = false;
            if (pt > maxPrepTime) maxPrepTime = pt;
        });

        // 3. Set Estimated Time String
        let finalEstimatedTime = "15-20 Menit";
        if (isFastLane) {
            finalEstimatedTime = "5-10 Menit";
        } else {
            if (maxPrepTime >= 20) {
                finalEstimatedTime = "25-30 Menit";
            } else {
                finalEstimatedTime = "15-20 Menit";
            }
        }
        // --- SMART QUEUE LOGIC END ---

        // 7. Daily Queue Number Logic (New - Smart Queue 2.0)
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const todayOrderCount = await prisma.order.count({
            where: {
                createdAt: {
                    gte: todayStart
                }
            }
        });
        const nextQueueNumber = todayOrderCount + 1;

        // 6. Prisma Transaction (Atomic Create)
        const newOrder = await prisma.$transaction(async (tx) => {
            const order = await tx.order.create({
                data: {
                    transactionCode,
                    queueNumber: nextQueueNumber, // Save Daily Number
                    customerName,
                    // Map tableId jika valid (Relasi ke Table)
                    tableId: finalTableId ? parseInt(finalTableId) : null,
                    orderType: finalOrderType,
                    totalAmount: calculatedTotal,
                    note: note || "",
                    deliveryAddress: deliveryAddress || "",
                    status: 'Pending',
                    paymentMethod: paymentMethod || null,
                    paymentStatus: paymentStatus || 'Unpaid',
                    estimatedTime: finalEstimatedTime, // Added Smart Estimation
                    items: {
                        create: orderItemsData
                    }
                },
                include: {
                    table: {
                        include: {
                            location: true
                        }
                    }
                }
            });

            // If we have storeId from Auth Middleware (req.storeId)
            // But createOrder is currently public (scanned by customer).
            // HOW TO HANDLE STORE ID FOR CUSTOMER ORDER?
            // The Table/QR must imply the Store.
            // We need to fetch StoreId from the Table->Location->Store Relation.

            // Logic Update: fetch Table first to get StoreId
            if (tableId) {
                const tableInfo = await prisma.table.findUnique({
                    where: { id: tableId },
                    include: { location: { include: { store: true } } }
                });
                if (tableInfo && tableInfo.location && tableInfo.location.storeId) {
                    await prisma.order.update({
                        where: { id: order.id },
                        data: { storeId: tableInfo.location.storeId }
                    });
                    // Also update newOrder object for response if needed
                    newOrder.storeId = tableInfo.location.storeId;
                }
            } else {
                // Taking away/Counter? We need a fallback "Default Store" or require StoreId in request body.
                // For now, let's assume req.body includes 'storeId' if scanned from a Store QR (future feature).
                // OR, update createOrder to accept storeId query param?
            }

            return order;
        });

        // 7. Real-time Trigger
        if (req.io) {
            req.io.emit('new_order', newOrder);
            console.log(`📡 Emitted 'new_order': ${newOrder.transactionCode}`);
        }

        res.status(201).json({
            message: 'Order created successfully',
            data: newOrder
        });

    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ error: 'Gagal membuat pesanan.' });
    }
};

const getAllOrders = async (req, res) => {
    try {
        const { status, type, search } = req.query;
        let whereClause = {};

        // Multi-tenancy Filter
        if (req.storeId) {
            whereClause.storeId = req.storeId;
        }

        if (status) {
            // Support comma-separated statuses e.g. "Completed,Cancelled"
            const statuses = status.split(',');
            if (statuses.length > 1) {
                whereClause.status = { in: statuses };
            } else {
                whereClause.status = status;
            }
        }

        const orders = await prisma.order.findMany({
            where: whereClause,
            orderBy: {
                createdAt: 'desc'
            },
            include: {
                items: {
                    include: {
                        product: true // Agar admin tahu nama produk yang dipesan
                    }
                },
                table: {
                    include: {
                        location: true
                    }
                }
            }
        });

        res.status(200).json({
            success: true,
            data: orders
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data pesanan',
            error: error.message
        });
    }
};

const updateOrderStatus = async (req, res) => {
    const { id } = req.params;
    const { status, paymentStatus } = req.body; // Accept paymentStatus

    try {
        // 1. Fetch Order first to get current data & items (for smart logic)
        const currentOrder = await prisma.order.findUnique({
            where: { id: parseInt(id) },
            include: { items: { include: { product: true } } }
        });

        if (!currentOrder) return res.status(404).json({ message: 'Order not found' });

        // Logic update field status dan paymentStatus
        let dataToUpdate = {};
        if (status) {
            dataToUpdate.status = status;

            // SMART QUEUE LOGIC: Set Target Time when Order starts Processing
            if (status === 'Processing' && !currentOrder.targetTime) {
                // Determine duration based on prepTime of items
                let durationMinutes = 5; // Default

                // Cek Max Prep Time dari items
                if (currentOrder.items && currentOrder.items.length > 0) {
                    const maxPrep = Math.max(...currentOrder.items.map(i => i.product.prepTime || 5));
                    // Jika minuman (2-3) -> 5 menit total
                    // Jika makanan (15) -> 20 menit total (buffer)
                    durationMinutes = maxPrep <= 5 ? 5 : (maxPrep + 5);
                }

                const targetTime = new Date();
                targetTime.setMinutes(targetTime.getMinutes() + durationMinutes);
                dataToUpdate.targetTime = targetTime;
                console.log(`⏱️ Order ${currentOrder.transactionCode} started processing. Target: ${targetTime.toLocaleTimeString()}`);
            }
        }
        if (paymentStatus) dataToUpdate.paymentStatus = paymentStatus;

        // Auto-update paymentStatus logic (optional fallback)
        if (status === 'Paid' && !paymentStatus) {
            dataToUpdate.paymentStatus = 'Paid';
        } else if (status === 'Cancelled' && !paymentStatus) {
            dataToUpdate.paymentStatus = 'Cancelled';
        }

        const updatedOrder = await prisma.order.update({
            where: { id: parseInt(id) },
            data: dataToUpdate,
            include: {
                items: {
                    include: { product: true }
                },
                table: {
                    include: {
                        location: true
                    }
                }
            }
        });

        // Emit socket event
        if (req.io) {
            req.io.emit('order_status_updated', updatedOrder);
            console.log(`📡 Emitted 'order_status_updated': ${updatedOrder.transactionCode} -> ${status}`);
        }

        res.status(200).json({
            success: true,
            message: 'Status pesanan berhasil diperbarui',
            data: updatedOrder
        });

    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal memperbarui status pesanan',
            error: error.message
        });
    }
};

const getOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await prisma.order.findUnique({
            where: { id: parseInt(id) },
            include: {
                items: {
                    include: { product: true }
                },
                table: {
                    include: { location: true }
                }
            }
        });

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        res.status(200).json({ success: true, data: order });
    } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

const getOrderByTransactionCode = async (req, res) => {
    try {
        const { code } = req.params;
        const order = await prisma.order.findUnique({
            where: { transactionCode: code },
            include: {
                items: {
                    include: { product: true }
                },
                table: {
                    include: { location: true }
                }
            }
        });

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // SMART QUEUE 3.0: Predictive Time & Dynamic Position
        // 1. Get ALL orders ahead (Pending/Processing) to sum their prep times
        const ordersQueue = await prisma.order.findMany({
            where: {
                createdAt: {
                    lt: order.createdAt,
                    gte: new Date(new Date().setHours(0, 0, 0, 0))
                },
                status: 'Pending' // User Request 5.0: Only Pending counts as "Queue"
            },
            include: { items: { include: { product: true } } }
        });

        const queuePosition = ordersQueue.length + 1; // My position (1-based)

        // 2. Calculate Cumulative Prep Time
        // Logic: Sum of max prep time per order in queue + my order
        let totalMinutesAhead = 0;

        // A. Duration of orders ahead
        for (const qOrder of ordersQueue) {
            let orderPrep = 5; // Default buffer
            if (qOrder.items && qOrder.items.length > 0) {
                // Take max prep time of items in that order (parallel prep)
                const maxP = Math.max(...qOrder.items.map(i => i.product.prepTime || 5));
                orderPrep = maxP;
            }
            totalMinutesAhead += orderPrep;
        }

        // B. Duration of MY order
        let myPrep = 5;
        if (order.items && order.items.length > 0) {
            myPrep = Math.max(...order.items.map(i => i.product.prepTime || 5));
        }

        // C. Total Service Time Calculation
        // If system is idle, starts from Now. If busy, adds to cumulative.
        // For simplicity: Now + Total Minutes Wait
        const now = new Date();
        const predictedTime = new Date(now.getTime() + (totalMinutesAhead + myPrep) * 60000);


        // Format to HH:mm
        const hours = String(predictedTime.getHours()).padStart(2, '0');
        const minutes = String(predictedTime.getMinutes()).padStart(2, '0');
        const clockTime = `${hours}:${minutes}`;

        res.status(200).json({
            success: true,
            data: {
                ...order,
                queuePosition: queuePosition, // Explicit Position (1, 2, 3)
                ordersAhead: ordersQueue.length, // 0 means I am next/processing
                predictedServiceTime: clockTime // "12:30"
            }
        });
    } catch (error) {
        console.error('Error fetching order by code:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

const getOrdersByBatch = async (req, res) => {
    try {
        const { codes } = req.body; // Expect array of transaction codes

        if (!codes || !Array.isArray(codes) || codes.length === 0) {
            return res.status(200).json({ success: true, data: [] });
        }

        const orders = await prisma.order.findMany({
            where: {
                transactionCode: { in: codes }
            },
            include: {
                items: {
                    include: { product: true }
                },
                table: {
                    include: { location: true }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        // Add simplified Queue Logic for Status Page (just to show accurate status text)
        // We iterate through them to add formatted prediction if needed, 
        // but for the Status LIST page, we might just need Status, Items, Total.
        // Let's keep it simple for now and just return the data. Frontend can format.

        res.status(200).json({
            success: true,
            data: orders
        });

    } catch (error) {
        console.error('Error fetching batch orders:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// --- CANCELLATION & REFUND LOGIC ---
const requestCancel = async (req, res) => {
    try {
        const { transactionCode, reason } = req.body;

        const order = await prisma.order.findUnique({
            where: { transactionCode }
        });

        if (!order) return res.status(404).json({ message: "Order not found" });

        if (order.status === 'Completed' || order.status === 'Cancelled') {
            return res.status(400).json({ message: "Pesanan ini tidak bisa dibatalkan lagi." });
        }

        let updatedData = {};
        let message = "";

        // Scenario 1: Pending -> Auto Cancel
        if (order.status === 'Pending') {
            updatedData = {
                status: 'Cancelled',
                cancellationReason: reason,
                cancellationStatus: 'AutoCancelled',
                // If Paid, set Refund Status to Pending
                refundStatus: order.paymentStatus === 'Paid' ? 'Pending' : null
            };
            message = "Pesanan berhasil dibatalkan otomatis.";
        }
        // Scenario 2: Processing -> Request
        else if (order.status === 'Processing') {
            updatedData = {
                cancellationStatus: 'Requested',
                cancellationReason: reason
            };
            message = "Permintaan pembatalan dikirim ke kasir.";
        } else {
            return res.status(400).json({ message: "Status pesanan tidak valid untuk pembatalan." });
        }

        const updatedOrder = await prisma.order.update({
            where: { transactionCode },
            data: updatedData,
            include: { items: { include: { product: true } } }
        });

        if (req.io) req.io.emit('order_status_updated', updatedOrder);

        res.json({ success: true, message, data: updatedOrder });

    } catch (e) {
        console.error(e);
        res.status(500).json({ message: "Gagal memproses pembatalan" });
    }
};

const approveCancel = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await prisma.order.findUnique({ where: { id: parseInt(id) } });

        if (!order) return res.status(404).json({ message: "Order not found" });

        const updatedOrder = await prisma.order.update({
            where: { id: parseInt(id) },
            data: {
                status: 'Cancelled',
                cancellationStatus: 'Approved',
                refundStatus: order.paymentStatus === 'Paid' ? 'Pending' : null
            },
            include: { items: { include: { product: true } } }
        });

        if (req.io) req.io.emit('order_status_updated', updatedOrder);
        res.json({ success: true, message: "Pembatalan Disetujui", data: updatedOrder });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: "Error approving cancellation" });
    }
};

const rejectCancel = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        console.log(`[DEBUG] Received Reject/Cancel for Order ${id}`);
        console.log(`[DEBUG] Reason provided: ${reason}`);

        const order = await prisma.order.findUnique({ where: { id: parseInt(id) } });

        let updatedData = {};
        let message = "";

        if (reason) {
            // FORCE CANCEL SCENARIO
            console.log(`[DEBUG] Executing Force Cancel`);
            updatedData = {
                status: 'Cancelled',
                cancellationStatus: 'RejectedByAdmin',
                cancellationReason: `Dibatalkan Kasir: ${reason}`,
                refundStatus: order.paymentStatus === 'Paid' ? 'Pending' : null
            };
            message = "Pesanan Dibatalkan Paksa oleh Kasir";
        } else {
            // STANDARD REJECT SCENARIO
            console.log(`[DEBUG] Executing Standard Reject`);
            updatedData = {
                cancellationStatus: 'Rejected'
            };
            message = "Permintaan Pembatalan Ditolak";
        }

        const updatedOrder = await prisma.order.update({
            where: { id: parseInt(id) },
            data: updatedData,
            include: { items: { include: { product: true } } }
        });

        if (req.io) req.io.emit('order_status_updated', updatedOrder);
        res.json({ success: true, message, data: updatedOrder });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: "Error rejecting cancellation" });
    }
};

const verifyRefund = async (req, res) => {
    try {
        const { transactionCode } = req.body;
        const order = await prisma.order.findUnique({ where: { transactionCode } });

        if (!order) return res.status(404).json({ message: "Order not found" });

        // Check validity for refund
        if (order.status !== 'Cancelled' && order.cancellationStatus !== 'AutoCancelled') {
            return res.status(400).json({ message: "Pesanan ini tidak dalam status Batal" });
        }

        if (order.paymentStatus !== 'Paid') {
            return res.status(400).json({ message: "Pesanan ini belum dibayar, tidak perlu refund." });
        }

        if (order.refundStatus === 'Refunded') {
            return res.status(400).json({ message: "Pesanan ini SUDAH di-refund sebelumnya." });
        }

        // Execute Refund
        const updatedOrder = await prisma.order.update({
            where: { transactionCode },
            data: { refundStatus: 'Refunded' }
        });

        if (req.io) req.io.emit('order_status_updated', updatedOrder);

        res.json({
            success: true,
            message: "Refund Valid & Berhasil Diverifikasi",
            amount: order.totalAmount
        });

    } catch (e) {
        console.error(e);
        res.status(500).json({ message: "Refund Error" });
    }
};

const exportOrdersPdf = async (req, res) => {
    try {
        const { status, type, search } = req.query; // Accept filters

        let whereClause = {};

        // 1. Status Filter
        if (status && status !== 'All') {
            const statuses = status.split(',');
            if (statuses.length > 1) {
                whereClause.status = { in: statuses };
            } else {
                whereClause.status = status;
            }
        }

        // 2. Type Filter
        if (type && type !== 'All') {
            whereClause.orderType = type;
        }

        // 3. Search Filter
        if (search) {
            whereClause.OR = [
                { transactionCode: { contains: search } },
                { customerName: { contains: search } },
                { items: { some: { product: { name: { contains: search } } } } }
            ];
        }

        const orders = await prisma.order.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            include: { items: { include: { product: true } } }
        });

        // Create PDF
        const doc = new PDFDocument({ margin: 30, size: 'A4' });

        // Stream Response
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=Laporan_Riwayat.pdf');
        doc.pipe(res);

        // Header
        doc.fontSize(20).text('Laporan Riwayat Pesanan', { align: 'center' });
        doc.moveDown();
        doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: 'right' });
        doc.moveDown();

        // Summary Code
        const totalRevenue = orders
            .filter(o => o.status === 'Completed')
            .reduce((sum, o) => sum + o.totalAmount, 0);

        doc.fontSize(12).text(`Total Pendapatan (Selesai): Rp ${totalRevenue.toLocaleString('id-ID')}`);
        doc.text(`Total Transaksi: ${orders.length}`);
        doc.moveDown();

        // Table
        const table = {
            title: "Daftar Transaksi",
            headers: ["No", "Kode", "Waktu", "Status", "Tipe", "Total"],
            rows: orders.map((o, index) => [
                index + 1,
                o.transactionCode || o.id,
                new Date(o.createdAt).toLocaleString('id-ID'),
                o.status,
                o.orderType || '-',
                `Rp ${o.totalAmount.toLocaleString('id-ID')}`
            ]),
        };

        await doc.table(table, {
            width: 535,
        });

        doc.end();

    } catch (error) {
        console.error('Error generating PDF:', error);
        res.status(500).send('Gagal membuat PDF');
    }
};

module.exports = {
    createOrder,
    getAllOrders,
    updateOrderStatus,
    getOrderById,
    getOrderByTransactionCode,
    getOrdersByBatch,
    requestCancel,
    approveCancel,
    rejectCancel,
    rejectCancel,
    verifyRefund,
    exportOrdersPdf
};
