const express = require('express');
const router = express.Router();
const storeController = require('../controllers/storeController');
const upload = require('../middleware/upload');

router.get('/', storeController.getStore);
router.put('/', storeController.updateStore);
router.post('/upload-logo', upload.single('image'), storeController.uploadLogo);
router.post('/upload-qris', upload.single('image'), storeController.uploadQris);

module.exports = router;
