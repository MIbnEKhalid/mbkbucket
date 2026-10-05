import express from "express";
import { sessRole } from "mbkauthe";
import multer from "multer";
import { requireBucketApi } from "../middleware/bucket-resolver.js";
import { cleanupUploads, listIncompleteUploads, listFiles, uploadSingleFile, initiateMultipartUpload, uploadChunk, completeUpload, abortUpload, createFolder, deleteItems, downloadFileHandler, moveItem, copyItem, getHealthStatus, getFileInfo } from "../controllers/api.controller.js";

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

export function createApiRoutes({
  authorization,
  viewAuthorization,
  uploadAuthorization,
  deleteAuthorization,
} = {}) {
  const apiRouter = express.Router();
  const defaultAuth = authorization ?? sessRole('superadmin');
  const viewAuth = viewAuthorization ?? defaultAuth;
  const uploadAuth = uploadAuthorization ?? defaultAuth;
  const deleteAuth = deleteAuthorization ?? defaultAuth;

  apiRouter.use(requireBucketApi);
  apiRouter.post('/api/cleanup-uploads', deleteAuth, cleanupUploads);
  apiRouter.get('/api/incomplete-uploads', viewAuth, listIncompleteUploads);
  apiRouter.get('/api/files', viewAuth, listFiles);
  apiRouter.get('/api/health', viewAuth, getHealthStatus);
  apiRouter.get('/api/file-info/*key', viewAuth, getFileInfo);
  apiRouter.post('/upload', uploadAuth, upload.single('file'), uploadSingleFile);
  apiRouter.post('/upload-init', uploadAuth, initiateMultipartUpload);
  apiRouter.post('/upload-chunk', uploadAuth, uploadChunkMiddleware, uploadChunk);
  apiRouter.post('/upload-complete', uploadAuth, completeUpload);
  apiRouter.post('/upload-abort', deleteAuth, abortUpload);
  apiRouter.post('/create-folder', uploadAuth, createFolder);
  apiRouter.post('/delete', deleteAuth, deleteItems);
  apiRouter.post('/move', uploadAuth, moveItem);
  apiRouter.post('/copy', uploadAuth, copyItem);
  apiRouter.get('/download/*key', viewAuth, downloadFileHandler);

  return apiRouter;
}

const router = createApiRoutes();

export default router;
