const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all locations
exports.getAllLocations = async (req, res) => {
    try {
        const locations = await prisma.location.findMany({
            orderBy: { name: 'asc' },
        });
        res.json(locations);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Create a new location
exports.createLocation = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ error: "Name is required" });
        }
        const location = await prisma.location.create({
            data: { name },
        });
        res.status(201).json(location);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Update a location
exports.updateLocation = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        const location = await prisma.location.update({
            where: { id: parseInt(id) },
            data: { name },
        });
        res.json(location);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Delete a location
exports.deleteLocation = async (req, res) => {
    try {
        const { id } = req.params;
        const locationId = parseInt(id);

        // Cek apakah lokasi ini dipakai oleh meja
        const tableCount = await prisma.table.count({
            where: { locationId: locationId },
        });

        if (tableCount > 0) {
            return res.status(400).json({
                error: "Lokasi tidak bisa dihapus karena masih memiliki meja.",
            });
        }

        await prisma.location.delete({
            where: { id: locationId },
        });

        res.json({ message: "Location deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
