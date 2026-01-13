const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    const token = req.header('Authorization')?.split(' ')[1];

    if (!token) {
        return res.status(403).json({ message: 'Akses ditolak. Token tidak ditemukan.' });
    }

    try {
        const secret = process.env.JWT_SECRET || 'rahasia_negara_api'; // Fallback for dev
        const decoded = jwt.verify(token, secret);

        req.user = decoded; // { id, email, role, storeId }

        // Convenience: Direct access to storeId
        req.storeId = decoded.storeId;

        next();
    } catch (error) {
        return res.status(401).json({ message: 'Token tidak valid or expired.' });
    }
};

module.exports = { verifyToken };
