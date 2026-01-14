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

const { identifyStore } = require('../middleware/authMiddleware');

// GET /api/store
// Ambil data store milik User yang login
const getStore = async (req, res) => {
    try {
        const storeId = identifyStore(req);
        if (!storeId) return res.status(400).json({ error: 'User tidak memiliki akses Toko' });

        const store = await prisma.store.findFirst({
            where: { id: storeId }
        });

        if (!store) return res.status(404).json({ error: 'Store not found' });

        res.json({ success: true, data: store });
    } catch (error) {
        console.error("Get Store Error:", error);
        res.status(500).json({ error: `Failed to fetch store: ${error.message}` });
    }
};

// PUT /api/store
// Update Info
const updateStore = async (req, res) => {
    try {
        const { name } = req.body;
        if (!req.storeId) return res.status(400).json({ error: 'User tidak memiliki akses Toko' });

        const updated = await prisma.store.update({
            where: { id: req.storeId },
            data: { name }
        });

        res.json({ success: true, data: updated });
    } catch (error) {
        console.error("Update Store Error:", error);
        res.status(500).json({ error: `Failed to update store: ${error.message}` });
    }
};

// POST /api/store/upload-logo
const uploadLogo = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        if (!req.storeId) return res.status(400).json({ error: 'User tidak memiliki akses Toko' });

        const store = await prisma.store.findUnique({ where: { id: req.storeId } });
        if (!store) return res.status(404).json({ error: 'Store not found' });

        // Delete old logo
        if (store.logo) deleteFile(store.logo);

        const filename = req.file.filename;

        const updated = await prisma.store.update({
            where: { id: req.storeId },
            data: { logo: filename }
        });

        res.json({ success: true, data: updated });
    } catch (error) {
        console.error("Upload Logo Error:", error);
        res.status(500).json({ error: `Failed to upload logo: ${error.message}` });
    }
};

// POST /api/store/upload-qris
const uploadQris = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        if (!req.storeId) return res.status(400).json({ error: 'User tidak memiliki akses Toko' });

        const store = await prisma.store.findUnique({ where: { id: req.storeId } });
        if (!store) return res.status(404).json({ error: 'Store not found' });

        // Delete old qris
        if (store.qrisImage) deleteFile(store.qrisImage);

        const filename = req.file.filename;

        const updated = await prisma.store.update({
            where: { id: req.storeId },
            data: { qrisImage: filename }
        });

        res.json({ success: true, data: updated });
    } catch (error) {
        console.error("Upload QRIS Error:", error);
        res.status(500).json({ error: `Failed to upload QRIS: ${error.message}` });
    }
};

module.exports = {
    getStore,
    updateStore,
    uploadLogo,
    uploadQris
};
