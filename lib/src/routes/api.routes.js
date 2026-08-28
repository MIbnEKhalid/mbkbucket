import express from "express";
import { sessRole } from "mbkauthe";
import multer from "multer";
import { requireBucketApi } from "../middleware/bucket-resolver.js";
import { cleanupUploads, listIncompleteUploads, listFiles, uploadSingleFile, initiateMultipartUpload, uploadChunk, completeUpload, abortUpload, createFolder, deleteItems, downloadFileHandler } from "../controllers/api.controller.js";

const router = express.Router();
const MAX_CHUNK_SIZE = 50 * 1024 * 1024; // 50 MB
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_CHUNK_SIZE } });

const uploadChunkMiddleware = (req, res, next) => {
  upload.single('chunk')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: `Chunk too large (max ${Math.round(MAX_CHUNK_SIZE / (1024 * 1024))} MB).`,
      });
    }
    if (err) return next(err);
    next();
  });
};

const adminAuth = sessRole('SuperAdmin');

router.use(requireBucketApi);

router.post('/api/cleanup-uploads', adminAuth, cleanupUploads);
router.get('/api/incomplete-uploads', adminAuth, listIncompleteUploads);
router.get('/api/files', adminAuth, listFiles);
router.post('/upload', adminAuth, upload.single('file'), uploadSingleFile);
router.post('/upload-init', adminAuth, initiateMultipartUpload);
router.post('/upload-chunk', adminAuth, uploadChunkMiddleware, uploadChunk);
router.post('/upload-complete', adminAuth, completeUpload);
router.post('/upload-abort', adminAuth, abortUpload);
router.post('/create-folder', adminAuth, createFolder);
router.post('/delete', adminAuth, deleteItems);
router.get('/download/*key', adminAuth, downloadFileHandler);

export default router;
