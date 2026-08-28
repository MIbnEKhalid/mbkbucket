import { resolveBucketName } from "../services/s3.service.js";
import { sendApiError, sendViewError } from "../utils/errors.js";

const NO_BUCKET_MSG = 'No bucket selected. Provide ?bucket=<name> or configure a default bucket in mbkautheVar.bucket.';

/**
 * Resolves `?bucket=<name>` query param and attaches `req.activeBucket` and `req.bucketResolveError`.
 */
export function bucketResolver(req, _res, next) {
  try {
    req.activeBucket = resolveBucketName(req.query.bucket);
    req.bucketResolveError = null;
  } catch (err) {
    req.activeBucket = null;
    req.bucketResolveError = err;
  }
  next();
}

/**
 * Guard middleware for API routes — returns 400/503 JSON if bucket is invalid.
 */
export function requireBucketApi(req, res, next) {
  if (req.bucketResolveError) return sendApiError(res, req.bucketResolveError, 'Invalid bucket selection');
  if (!req.activeBucket) return sendApiError(res, new Error(NO_BUCKET_MSG));
  next();
}

/**
 * Guard middleware for view routes — returns 400/503 JSON if bucket is invalid (skips /p_view/...).
 */
export function requireBucketView(req, res, next) {
  if (req.path.startsWith('/p_view/')) return next();
  if (req.bucketResolveError) return sendViewError(res, req.bucketResolveError, 'Invalid bucket selection');
  if (!req.activeBucket) return sendViewError(res, new Error(NO_BUCKET_MSG));
  next();
}
