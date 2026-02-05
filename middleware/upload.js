const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure directory exists
const uploadDir = 'public/images';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        console.log('[UPLOAD_DEBUG] Incoming file:', file.originalname, 'Mime:', file.mimetype);

        // Case-insensitive check
        if (file.mimetype === 'model/gltf-binary' || file.originalname.toLowerCase().endsWith('.glb')) {
            console.log('[UPLOAD_DEBUG] Detected as AR Model -> public/ar-assets');
            cb(null, 'public/ar-assets');
        } else {
            console.log('[UPLOAD_DEBUG] Detected as Image -> public/images');
            cb(null, 'public/images');
        }
    },
    filename: (req, file, cb) => {
        // AR Models: Keep original name (Sanitized)
        if (file.mimetype === 'model/gltf-binary' || file.originalname.toLowerCase().endsWith('.glb')) {
            // AR Models: Unique Name (Timestamp + Clean Name)
            // prevent collision on disk
            const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
            const uniqueName = Date.now() + '_' + safeName;
            console.log('[UPLOAD_DEBUG] Saving AR as:', uniqueName);
            cb(null, uniqueName);
        } else {
            // Images: Random Name
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const imgName = 'IMG-' + uniqueSuffix + path.extname(file.originalname);
            console.log('[UPLOAD_DEBUG] Saving IMG as:', imgName);
            cb(null, imgName);
        }
    }
});

const fileFilter = (req, file, cb) => {
    const isGlb = file.originalname.toLowerCase().endsWith('.glb');
    if (file.mimetype.startsWith('image/') ||
        file.mimetype === 'model/gltf-binary' ||
        file.mimetype === 'application/octet-stream' ||
        isGlb) {
        cb(null, true);
    } else {
        console.log('[UPLOAD_DEBUG] Rejected file type:', file.mimetype);
        cb(new Error('Invalid file type! Only Images and GLB models are allowed.'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 1024 * 1024 * 40 // 40MB limit (Strict AR)
    },
    fileFilter: fileFilter
});

module.exports = upload;
