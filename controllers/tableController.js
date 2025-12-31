const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');

// Helper Generate QR
const generateQRCode = () => {
    const timestamp = Date.now().toString().slice(-8); // Ambil 8 digit terakhir timestamp
    const random = crypto.randomBytes(2).toString('hex').toUpperCase(); // 4 karakter hex random
    return `TBL-${timestamp}-${random}`;
};

// Get all tables
exports.getAllTables = async (req, res) => {
    try {
        const tables = await prisma.table.findMany({
            include: { location: true },
            orderBy: { name: 'asc' },
        });
        res.json(tables);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Create a new table
exports.createTable = async (req, res) => {
    try {
        const { name, locationId } = req.body;

        if (!name || !locationId) {
            return res.status(400).json({ error: "Name and Location ID are required" });
        }

        const qrString = generateQRCode();

        const table = await prisma.table.create({
            data: {
                name,
                locationId: parseInt(locationId),
                qrCode: qrString,
            },
            include: { location: true },
        });
        res.status(201).json(table);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Update a table
exports.updateTable = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, locationId, isActive } = req.body;

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (locationId !== undefined) updateData.locationId = parseInt(locationId);
        if (isActive !== undefined) updateData.isActive = isActive;

        const table = await prisma.table.update({
            where: { id: parseInt(id) },
            data: updateData,
            include: { location: true },
        });
        res.json(table);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Update table status
exports.updateTableStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        const table = await prisma.table.update({
            where: { id: parseInt(id) },
            data: { isActive },
            include: { location: true },
        });
        res.json(table);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Delete a table
exports.deleteTable = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.table.delete({
            where: { id: parseInt(id) },
        });
        res.json({ message: "Table deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
