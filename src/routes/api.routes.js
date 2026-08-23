import express from "express";
import { sessRole } from "mbkauthe";
import multer from "multer";
import { requireBucketApi } from "../middleware/bucket-resolver.js";
import {
  cleanupUploads, listIncompleteUploads, listFiles,
  uploadSingleFile, initiateMultipartUpload, uploadChunk,
  completeUpload, abortUpload, createFolder, deleteItems,
  downloadFileHandler
} from "../controllers/api.controller.js";

const router = express.Router();

const MAX_CHUNK_SIZE = 50 * 1024 * 1024; // 50 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CHUNK_SIZE }
});

const uploadChunkMiddleware = (req, res, next) => {
  upload.single('chunk')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          error: `Chunk too large (max ${Math.round(MAX_CHUNK_SIZE / (1024 * 1024))} MB).`,
        });
      }
      return next(err);
    }
    next();
  });
};

// Bucket guard for all API routes
router.use(requireBucketApi);

// Multipart upload cleanup
router.post('/api/cleanup-uploads', sessRole('SuperAdmin'), cleanupUploads);

// List incomplete multipart uploads
router.get('/api/incomplete-uploads', sessRole('SuperAdmin'), listIncompleteUploads);

// List files
router.get('/api/files', sessRole('SuperAdmin'), listFiles);

// Single-file upload
router.post('/upload', sessRole('SuperAdmin'), upload.single('file'), uploadSingleFile);

// Multipart upload flow
router.post('/upload-init', sessRole('SuperAdmin'), initiateMultipartUpload);
router.post('/upload-chunk', sessRole('SuperAdmin'), uploadChunkMiddleware, uploadChunk);
router.post('/upload-complete', sessRole('SuperAdmin'), completeUpload);
router.post('/upload-abort', sessRole('SuperAdmin'), abortUpload);

// Folder operations
router.post('/create-folder', sessRole('SuperAdmin'), createFolder);

// Delete operations
router.post('/delete', sessRole('SuperAdmin'), deleteItems);

// Download
router.get('/download/*key', sessRole('SuperAdmin'), downloadFileHandler);

export default router;
