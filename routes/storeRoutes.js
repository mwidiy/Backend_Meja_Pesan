const express = require('express');
const router = express.Router();
const storeController = require('../controllers/storeController');
const upload = require('../middleware/upload');

const { verifyToken } = require('../middleware/authMiddleware');

router.get('/', storeController.getStore);
router.put('/', verifyToken, storeController.updateStore);
router.post('/upload-logo', verifyToken, upload.single('image'), storeController.uploadLogo);
router.post('/upload-qris', verifyToken, upload.single('image'), storeController.uploadQris);

module.exports = router;
