const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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

        // 6. Prisma Transaction (Atomic Create)
        const newOrder = await prisma.$transaction(async (tx) => {
            const order = await tx.order.create({
                data: {
                    transactionCode,
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
                    items: {
                        create: orderItemsData
                    }
                },
                include: {
                    items: {
                        include: {
                            product: true
                        }
                    },
                    table: {
                        include: {
                            location: true
                        }
                    }
                }
            });

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
        const { status } = req.query;
        let whereClause = {};

        if (status) {
            whereClause.status = status;
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
        // Logic update field status dan paymentStatus
        let dataToUpdate = {};
        if (status) dataToUpdate.status = status;
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

        res.status(200).json({ success: true, data: order });
    } catch (error) {
        console.error('Error fetching order by code:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

module.exports = {
    createOrder,
    getAllOrders,
    updateOrderStatus,
    getOrderById,
    getOrderByTransactionCode
};
