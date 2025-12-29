const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET /api/products
// Ambil semua produk yang aktif
const getAllProducts = async (req, res) => {
    try {
        const products = await prisma.product.findMany({
            // Filter where DIHAPUS agar semua data muncul
            orderBy: [
                { category: 'asc' }, // Urutkan jenisnya dulu (Makanan -> Minuman)
                { name: 'asc' }      // Lalu urutkan abjad namanya (A -> Z)
            ]
        });

        res.status(200).json({
            success: true,
            message: "List semua menu berhasil diambil",
            data: products,
        });
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).json({
            success: false,
            message: "Gagal mengambil data produk",
            error: error.message,
        });
    }
};

// GET /api/products/:id
// Ambil detail produk berdasarkan ID
const getProductById = async (req, res) => {
    const { id } = req.params;
    try {
        const product = await prisma.product.findUnique({
            where: { id: Number(id) }
        });

        if (!product) {
            return res.status(404).json({ success: false, message: "Produk tidak ditemukan" });
        }

        res.status(200).json({
            success: true,
            data: product
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// POST /api/products
// Tambah Menu Baru
const createProduct = async (req, res) => {
    const { name, category, price, description, image } = req.body;
    try {
        const newProduct = await prisma.product.create({
            data: {
                name,
                category,
                price: Number(price),
                description,
                image,
                isActive: true // Default true as per requirement
            }
        });
        res.status(201).json({
            success: true,
            message: "Produk berhasil ditambahkan",
            data: newProduct
        });
    } catch (error) {
        console.error("Error creating product:", error);
        res.status(500).json({
            success: false,
            message: "Gagal menambahkan produk",
            error: error.message
        });
    }
};

// PUT /api/products/:id
// Edit Menu
const updateProduct = async (req, res) => {
    const { id } = req.params;
    const { name, category, price, description, image, isActive } = req.body;

    try {
        // Cek apakah produk ada
        const existingProduct = await prisma.product.findUnique({ where: { id: Number(id) } });
        if (!existingProduct) {
            return res.status(404).json({ success: false, message: "Produk tidak ditemukan" });
        }

        const updatedProduct = await prisma.product.update({
            where: { id: Number(id) },
            data: {
                name: name !== undefined ? name : undefined,
                category: category !== undefined ? category : undefined,
                price: price !== undefined ? Number(price) : undefined,
                description: description !== undefined ? description : undefined,
                image: image !== undefined ? image : undefined,
                isActive: isActive !== undefined ? isActive : undefined
            }
        });

        res.status(200).json({
            success: true,
            message: "Produk berhasil diupdate",
            data: updatedProduct
        });
    } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).json({ success: false, message: "Gagal update produk", error: error.message });
    }
};

// DELETE /api/products/:id
// Hapus Menu
const deleteProduct = async (req, res) => {
    const { id } = req.params;
    try {
        const product = await prisma.product.findUnique({ where: { id: Number(id) } });
        if (!product) return res.status(404).json({ success: false, message: "Produk tidak ditemukan" });

        await prisma.product.delete({
            where: { id: Number(id) }
        });

        res.status(200).json({
            success: true,
            message: "Produk berhasil dihapus"
        });
    } catch (error) {
        console.error("Error deleting product:", error);
        res.status(500).json({ success: false, message: "Gagal menghapus produk", error: error.message });
    }
};

module.exports = {
    getAllProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct
};
