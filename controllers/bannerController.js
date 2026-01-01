const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

// Helper function untuk menghapus gambar fisik
// Sama seperti di productController
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

// GET /api/banners
// Ambil semua banner
const getAllBanners = async (req, res) => {
    const { status } = req.query;
    try {
        const banners = await prisma.banner.findMany({
            where: status === 'active' ? { isActive: true } : {},
            orderBy: { createdAt: 'asc' } // Urutkan dari yang terlama (Ascending)
        });

        res.status(200).json({
            success: true,
            message: "List semua banner berhasil diambil",
            data: banners,
        });
    } catch (error) {
        console.error("Error fetching banners:", error);
        res.status(500).json({
            success: false,
            message: "Gagal mengambil data banner",
            error: error.message,
        });
    }
};

// POST /api/banners
// Tambah Banner Baru
const createBanner = async (req, res) => {
    const { title, subtitle, highlightText } = req.body;

    // Validasi: Pastikan gambar diupload
    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: "Image is required"
        });
    }

    const imageUrl = `http://${req.headers.host}/uploads/${req.file.filename}`;

    try {
        const newBanner = await prisma.banner.create({
            data: {
                title,
                subtitle: subtitle || null,
                highlightText: highlightText || null,
                image: imageUrl,
                isActive: true
            }
        });

        // Trigger Realtime
        if (req.io) {
            req.io.emit('banners_updated');
        }

        res.status(201).json({
            success: true,
            message: "Banner berhasil ditambahkan",
            data: newBanner
        });
    } catch (error) {
        console.error("Error creating banner:", error);
        // Hapus gambar jika gagal insert DB untuk menghindari file sampah
        if (req.file) {
            removeImage(imageUrl);
        }
        res.status(500).json({
            success: false,
            message: "Gagal menambahkan banner",
            error: error.message
        });
    }
};

// PUT /api/banners/:id
// Update Banner
const updateBanner = async (req, res) => {
    const { id } = req.params;
    const { title, subtitle, highlightText, isActive } = req.body;

    try {
        // Cari banner lama
        const existingBanner = await prisma.banner.findUnique({ where: { id: Number(id) } });
        if (!existingBanner) {
            return res.status(404).json({ success: false, message: "Banner tidak ditemukan" });
        }

        let imageUrl = existingBanner.image;

        // Cek Gambar Baru
        if (req.file) {
            // Panggil helper removeImage() untuk menghapus gambar lama
            if (existingBanner.image) {
                removeImage(existingBanner.image);
            }
            // Update URL baru
            imageUrl = `http://${req.headers.host}/uploads/${req.file.filename}`;
        }
        // Jika tidak upload: Gunakan gambar lama (imageUrl sudah diset ke existingBanner.image)

        // Update DB
        const updatedBanner = await prisma.banner.update({
            where: { id: Number(id) },
            data: {
                title: title !== undefined ? title : undefined,
                subtitle: subtitle !== undefined ? subtitle : undefined,
                highlightText: highlightText !== undefined ? highlightText : undefined,
                image: imageUrl,
                isActive: isActive !== undefined ? (String(isActive) === 'true') : undefined
            }
        });

        // Trigger Realtime
        if (req.io) {
            req.io.emit('banners_updated');
        }

        res.status(200).json({
            success: true,
            message: "Banner berhasil diupdate",
            data: updatedBanner
        });

    } catch (error) {
        console.error("Error updating banner:", error);
        // Hapus gambar baru jika gagal update DB
        if (req.file) {
            const newImageUrl = `http://${req.headers.host}/uploads/${req.file.filename}`;
            removeImage(newImageUrl);
        }
        res.status(500).json({ success: false, message: "Gagal update banner", error: error.message });
    }
};

// DELETE /api/banners/:id
// Hapus Banner
const deleteBanner = async (req, res) => {
    const { id } = req.params;
    try {
        const banner = await prisma.banner.findUnique({ where: { id: Number(id) } });
        if (!banner) return res.status(404).json({ success: false, message: "Banner tidak ditemukan" });

        // Hapus gambar fisiknya
        if (banner.image) {
            removeImage(banner.image);
        }

        // Hapus data dari database
        await prisma.banner.delete({
            where: { id: Number(id) }
        });

        // Trigger Realtime
        if (req.io) {
            req.io.emit('banners_updated');
        }

        res.status(200).json({
            success: true,
            message: "Banner berhasil dihapus"
        });
    } catch (error) {
        console.error("Error deleting banner:", error);
        res.status(500).json({ success: false, message: "Gagal menghapus banner", error: error.message });
    }
};

module.exports = {
    getAllBanners,
    createBanner,
    updateBanner,
    deleteBanner
};
