const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

// Helper function untuk menghapus gambar fisik
const removeImage = (filePath) => {
    if (!filePath) return;

    // filePath usually looks like: http://localhost:3000/uploads/image-123.jpg
    // We need to extract the filename: image-123.jpg
    try {
        const urlObj = new URL(filePath); // Safe parsing if it's a full URL
        const fileName = path.basename(urlObj.pathname);
        const localPath = path.join(__dirname, '../public/images', fileName);

        if (fs.existsSync(localPath)) {
            fs.unlinkSync(localPath);
            console.log(`🗑️ Deleted old image: ${fileName}`);
        }
    } catch (err) {
        // Fallback if filePath is just a relative path or invalid URL
        console.log(`⚠️ Could not parse URL or delete image: ${filePath}`, err.message);
        // Try simple basename just in case it's not a full URL
        try {
            const fileName = path.basename(filePath);
            const localPath = path.join(__dirname, '../public/images', fileName);
            if (fs.existsSync(localPath)) {
                fs.unlinkSync(localPath);
                console.log(`🗑️ Deleted old image (fallback): ${fileName}`);
            }
        } catch (e) {
            console.error("Failed to delete image", e);
        }
    }
};

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
    const { name, category, price, description } = req.body;
    let imageUrl = req.body.image; // Bisa dari input manual jika ada

    if (req.file) {
        imageUrl = `http://${req.headers.host}/uploads/${req.file.filename}`;
    }

    try {
        const newProduct = await prisma.product.create({
            data: {
                name,
                category,
                price: Number(price),
                description,
                image: imageUrl,
                isActive: true // Default true as per requirement
            }
        });

        // Trigger update real-time
        req.io.emit('products_updated');

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
    const { name, category, price, description, isActive } = req.body;
    let imageUrl = req.body.image;

    if (req.file) {
        imageUrl = `http://${req.headers.host}/uploads/${req.file.filename}`;
    }

    try {
        // Cek apakah produk ada
        const existingProduct = await prisma.product.findUnique({ where: { id: Number(id) } });
        if (!existingProduct) {
            return res.status(404).json({ success: false, message: "Produk tidak ditemukan" });
        }

        // Jika ada file baru yang diupload, hapus gambar lama
        if (req.file && existingProduct.image) {
            removeImage(existingProduct.image);
        }

        const updatedProduct = await prisma.product.update({
            where: { id: Number(id) },
            data: {
                name: name !== undefined ? name : undefined,
                category: category !== undefined ? category : undefined,
                price: price !== undefined ? Number(price) : undefined,
                description: description !== undefined ? description : undefined,
                image: imageUrl !== undefined ? imageUrl : undefined, // Update jika ada gambar baru/url baru
                // Handle parsing boolean untuk isActive (terutama dari form-data)
                isActive: isActive !== undefined ? (String(isActive) === 'true') : undefined
            }
        });

        // Trigger update real-time
        req.io.emit('products_updated');

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

        // Hapus file gambar jika ada
        if (product.image) {
            removeImage(product.image);
        }

        await prisma.product.delete({
            where: { id: Number(id) }
        });

        // Trigger update real-time
        req.io.emit('products_updated');

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
