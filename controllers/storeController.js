const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

// Helper to delete old file if needed
const deleteFile = (filename) => {
    if (!filename) return;
    // Cek apakah itu URL atau nama file local
    if (filename.startsWith('http')) return;

    const filePath = path.join(__dirname, '../public/images', filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
};

// GET /api/store
// Ambil data store (Assume single store for now)
const getStore = async (req, res) => {
    try {
        // Cari store pertama
        let store = await prisma.store.findFirst();

        // Jika belum ada, buat default dummy
        if (!store) {
            let user = await prisma.user.findFirst();

            // FIX: Jika User juga belum ada, buat User dummy dulu
            if (!user) {
                console.log("⚠️ No user found. Creating default admin user for store...");
                user = await prisma.user.create({
                    data: {
                        email: "admin@kasirotomatis.com",
                        name: "Admin Kasir",
                        role: "owner"
                    }
                });
            }

            store = await prisma.store.create({
                data: {
                    name: "Dapur QuackXel Default",
                    ownerId: user.id
                }
            });
            console.log("✅ Default Store created linked to user:", user.email);
        }

        res.json({ success: true, data: store });
    } catch (error) {
        console.error("Get Store Error:", error);
        res.status(500).json({ error: 'Failed to fetch store data' });
    }
};

// PUT /api/store
// Update Info (Name only usually, images via separate endpoint or same)
const updateStore = async (req, res) => {
    try {
        const { name } = req.body;

        let store = await prisma.store.findFirst();
        if (!store) return res.status(404).json({ error: 'Store not found' });

        const updated = await prisma.store.update({
            where: { id: store.id },
            data: { name }
        });

        res.json({ success: true, data: updated });
    } catch (error) {
        console.error("Update Store Error:", error);
        res.status(500).json({ error: 'Failed to update store' });
    }
};

// POST /api/store/upload-logo
const uploadLogo = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        let store = await prisma.store.findFirst();
        if (!store) return res.status(404).json({ error: 'Store not found' });

        // Delete old logo
        if (store.logo) deleteFile(store.logo);

        const filename = req.file.filename; // Multer saves filename
        // const fullUrl = `${req.protocol}://${req.get('host')}/uploads/${filename}`; // Optional: save full URL or just filename

        const updated = await prisma.store.update({
            where: { id: store.id },
            data: { logo: filename }
        });

        res.json({ success: true, data: updated });
    } catch (error) {
        console.error("Upload Logo Error:", error);
        res.status(500).json({ error: 'Failed to upload logo' });
    }
};

// POST /api/store/upload-qris
const uploadQris = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        let store = await prisma.store.findFirst();
        if (!store) return res.status(404).json({ error: 'Store not found' });

        // Delete old qris
        if (store.qrisImage) deleteFile(store.qrisImage);

        const filename = req.file.filename;

        const updated = await prisma.store.update({
            where: { id: store.id },
            data: { qrisImage: filename }
        });

        res.json({ success: true, data: updated });
    } catch (error) {
        console.error("Upload QRIS Error:", error);
        res.status(500).json({ error: 'Failed to upload QRIS' });
    }
};

module.exports = {
    getStore,
    updateStore,
    uploadLogo,
    uploadQris
};
