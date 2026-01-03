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
        const {
            customerName,
            tableId,
            orderType,
            items,
            notes,
            deliveryLocation
        } = req.body;

        // 1. Validasi Input Dasar
        if (!customerName || !items || items.length === 0) {
            return res.status(400).json({ error: 'Customer name dan items harus diisi.' });
        }

        // 2. Logic Note Handling
        // Gabungkan deliveryLocation ke globalNote jika ada
        let globalNote = notes || '';
        if (deliveryLocation) {
            const deliveryNote = `Lokasi: ${deliveryLocation}`;
            globalNote = globalNote ? `${deliveryNote}. Catatan: ${globalNote}` : deliveryNote;
        }

        // 3. Hitung Total Amount dari items & Siapkan Data Items
        // Kita hitung di backend untuk memastikan konsistensi (opsional: bisa juga terima dari FE, tapi lebih aman hitung ulang)
        let calculatedTotal = 0;
        const orderItemsData = items.map(item => {
            const itemTotal = item.price * item.quantity;
            calculatedTotal += itemTotal;
            return {
                productId: item.productId,
                quantity: item.quantity,
                priceSnapshot: item.price, // Harga saat checkout
                // note: item.note // Jika ada per-item note di masa depan
            };
        });

        // 4. Generate Transaction Code Unik
        const transactionCode = generateTransactionCode();

        // 5. Prisma Transaction (Atomic Create)
        // Kita gunakan nested write agar Order dan OrderItem tersimpan bersamaan dalam satu transaksi database.
        const newOrder = await prisma.$transaction(async (tx) => {
            // Cek apakah code unik, jika collision (sangat jarang), prisma akan throw error unique constraint.
            // Di production yang padat, mungkin perlu retry mechanism, tapi untuk sekarang cukup generate sekali.

            const order = await tx.order.create({
                data: {
                    transactionCode,
                    customerName,
                    tableId: tableId ? parseInt(tableId) : null,
                    orderType,
                    totalAmount: calculatedTotal,
                    globalNote,
                    status: 'Pending',
                    paymentStatus: 'Unpaid',
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
                    table: true
                }
            });

            return order;
        });

        // 6. Real-time Trigger (Opsional)
        // Pastikan req.io ada sebelum emit
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
                table: true // Agar admin tahu ini meja nomor berapa
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
    const { status } = req.body;

    try {
        // Logic update field status dan paymentStatus
        let dataToUpdate = { status };

        if (status === 'Paid') {
            dataToUpdate.paymentStatus = 'Paid';
        } else if (status === 'Cancelled') {
            dataToUpdate.paymentStatus = 'Cancelled'; // Opsional: sesuaikan jika ada logic refund
        }

        const updatedOrder = await prisma.order.update({
            where: { id: parseInt(id) },
            data: dataToUpdate,
            include: {
                items: {
                    include: { product: true }
                },
                table: true
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

module.exports = {
    createOrder,
    getAllOrders,
    updateOrderStatus
};
