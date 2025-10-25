const express = require('express');
const multer = require('multer');
const { uploadFile, streamFile, deleteFile } = require('../controller/mediaController');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 * 200 } }); // 200MB max

router.post('/', upload.single('file'), uploadFile);
router.get('/:id', streamFile);
router.delete('/:id', deleteFile);

module.exports = router;
