const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');

// Helper: Slugify Name (Huruf kecil, spasi jadi strip)
const createSlug = (name) => {
    return name.toString().toLowerCase().trim().replace(/\s+/g, '-');
};

// Helper: Generate Random Alphanumeric String
const generateRandomString = (length) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
        result += chars[bytes[i] % chars.length];
    }
    return result;
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

        // Generate QR Logic: TBL-[SLUG_NAMA]-[RANDOM_STRING]
        const slug = createSlug(name);
        const randomStr = generateRandomString(4); // 4 digit alphanumeric
        const qrCode = `TBL-${slug}-${randomStr}`;

        const table = await prisma.table.create({
            data: {
                name,
                locationId: parseInt(locationId),
                qrCode, // Auto-generated
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

        // Note: qrCode is NOT updated to preserve printed stickers

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
