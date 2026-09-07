/**
 * MBKBucket
 * Copyright (c) 2026 Muhammad Bin Khalid, MBKTech.org and contributors
 * Licensed under the MIT License.
 * Source: https://github.com/MIbnEKhalid/mbkbucket
 */

// Type definitions for mbkbucket
// Project: https://github.com/MIbnEKhalid/mbkbucket
// Definitions by: Muhammad Bin Khalid <https://github.com/MIbnEKhalid>

/// <reference types="node" />

import type { Readable } from "node:stream";
import type { S3Client } from "@aws-sdk/client-s3";
import type { Application, Router, Request, Response, NextFunction, RequestHandler, ErrorRequestHandler } from "express";
import type { Debugger } from "debug";

// ===========================================================================
// Core Configuration & Connection Types
// ===========================================================================

/**
 * Configuration options for a single S3/R2 bucket connection.
 */
export interface BucketConfig {
  /** Bucket name in the remote object store */
  BUCKET_NAME: string;
  /** S3-compatible API endpoint URL (e.g. Cloudflare R2, AWS S3, MinIO, iDrive E2) */
  ENDPOINT?: string;
  /** Access Key ID credentials */
  ACCESS_KEY_ID?: string;
  /** Secret Access Key credentials */
  SECRET_ACCESS_KEY?: string;
  /** AWS or S3 Region (defaults to 'auto' for R2 / custom endpoints) */
  region?: string;
  /** Additional bucket-specific properties */
  [key: string]: any;
}

/**
 * Mapping of bucket identifier names to their corresponding BucketConfig.
 */
export type BucketConnectionMap = Record<string, BucketConfig>;

/**
 * Resolved bucket client and configuration container.
 */
export interface BucketClientAndConfig {
  /** Configured S3Client instance */
  client: S3Client;
  /** Resolved configuration object */
  config: BucketConfig;
  /** Resolved bucket name key */
  bucketName: string;
}

/**
 * Parsed configuration variables for mbkbucket.
 */
export interface ConfigVars {
  /** Whether public file viewing (/mbkbucket/p_view/...) is enabled */
  publiView_enabled: boolean;
  /** Whether public views should render inline in the browser when supported */
  p_view_inline: boolean;
  /** Additional custom configuration variables */
  [key: string]: any;
}

/**
 * Health check response status.
 */
export interface HealthCheckResult {
  /** Health status: 'healthy' or 'unhealthy' */
  status: "healthy" | "unhealthy" | string;
  /** Response time in milliseconds (when healthy) */
  responseTime?: number;
  /** Target bucket name tested */
  bucket?: string;
  /** Target region */
  region?: string;
  /** Error message if health check failed */
  error?: string;
  /** ISO 8601 timestamp of the health check query */
  checkedAt: string;
}

// ===========================================================================
// S3 Operation Options & Results
// ===========================================================================

/**
 * Options for uploading a file to S3/R2.
 */
export interface UploadOptions {
  /** Custom metadata key-value pairs attached to the object */
  metadata?: Record<string, string>;
  /** HTTP Cache-Control header (default: 'public, max-age=31536000') */
  cacheControl?: string;
  /** S3 Storage Class (default: 'STANDARD') */
  storageClass?: string;
  /** S3 Server-side encryption algorithm (default: 'AES256') */
  serverSideEncryption?: string;
  /** Target bucket identifier name (falls back to default bucket) */
  bucketName?: string;
  /** If true, sets IfNoneMatch: '*' to prevent overwriting existing objects */
  preventOverwrite?: boolean;
  /** Additional AWS PutObjectCommand options */
  [key: string]: any;
}

/**
 * Result returned upon successful file upload.
 */
export interface UploadResult {
  /** Uploaded file size in bytes */
  fileSize: number;
  /** Resolved full S3 key (with app prefix if applicable) */
  key: string;
  /** MIME content type */
  contentType: string;
  /** ISO 8601 timestamp of upload */
  uploadedAt: string;
  /** S3 ETag checksum if returned by store */
  ETag?: string;
  /** Additional S3 PutObject response properties */
  [key: string]: any;
}

/**
 * Options for downloading a file from S3/R2.
 */
export interface DownloadOptions {
  /** HTTP Range header value (e.g. 'bytes=0-1024') */
  range?: string | null;
  /** ETag value for conditional download (If-None-Match) */
  ifNoneMatch?: string | null;
  /** Modified date for conditional download (If-Modified-Since) */
  ifModifiedSince?: Date | string | null;
  /** Override Cache-Control header in response */
  responseCacheControl?: string | null;
  /** Override Content-Type header in response */
  responseContentType?: string | null;
  /** Target bucket identifier name */
  bucketName?: string;
  /** Additional AWS GetObjectCommand options */
  [key: string]: any;
}

/**
 * Object result returned from S3 GetObject.
 */
export interface S3ObjectResult {
  /** Readable stream of the object body */
  Body: Readable;
  /** Object size in bytes */
  ContentLength?: number;
  /** Object MIME content type */
  ContentType?: string;
  /** Object last modified date */
  LastModified?: Date;
  /** Resolved full object key */
  Key?: string;
  /** Resolved key */
  key?: string;
  /** Object ETag */
  ETag?: string;
  /** True if the object was not modified (HTTP 304 response) */
  notModified?: boolean;
  /** Object metadata */
  Metadata?: Record<string, string>;
  /** Additional S3 GetObject response properties */
  [key: string]: any;
}

/**
 * Return type for downloadFile, handling both regular downloads and 304 Not Modified.
 */
export type DownloadResult = S3ObjectResult | ({ notModified: true; key: string } & Partial<S3ObjectResult>);

/**
 * Options for listing files in S3/R2.
 */
export interface ListFilesOptions {
  /** Maximum number of keys to return (default: 1000) */
  maxKeys?: number;
  /** Continuation token for pagination */
  continuationToken?: string | null;
  /** Delimiter for grouping hierarchy (e.g. '/') */
  delimiter?: string | null;
  /** Whether to fetch object owner information */
  fetchOwner?: boolean;
  /** Key to start listing after */
  startAfter?: string | null;
  /** Target bucket identifier name */
  bucketName?: string;
  /** Additional AWS ListObjectsV2Command options */
  [key: string]: any;
}

/**
 * Individual object summary in listfiles result.
 */
export interface S3ObjectSummary {
  /** Object key */
  Key?: string;
  /** Last modified timestamp */
  LastModified?: Date;
  /** ETag of the object */
  ETag?: string;
  /** File size in bytes */
  Size?: number;
  /** Storage class */
  StorageClass?: string;
  /** Owner information if requested */
  Owner?: { DisplayName?: string; ID?: string; [key: string]: any };
  [key: string]: any;
}

/**
 * Common prefix summary for directory-like grouping.
 */
export interface S3CommonPrefix {
  /** Common prefix folder path */
  Prefix?: string;
  [key: string]: any;
}

/**
 * Result returned by listfiles.
 */
export interface ListFilesResult extends Record<string, any> {
  /** List of object summaries */
  Contents?: S3ObjectSummary[];
  /** List of common prefixes (subfolders) */
  CommonPrefixes?: S3CommonPrefix[];
  /** Bucket name */
  Name?: string;
  /** Listing prefix used */
  Prefix?: string;
  /** Maximum keys requested */
  MaxKeys?: number;
  /** True if listing was truncated and more pages exist */
  IsTruncated?: boolean;
  /** Number of keys returned in this response */
  KeyCount?: number;
  /** ISO 8601 timestamp of listing query */
  requestedAt: string;
  /** Number of files found */
  totalFiles: number;
  /** Whether more results are available */
  hasMore: boolean;
  /** Token for fetching the next page of results, or null */
  nextToken: string | null;
}

/**
 * File metadata result returned by getFileMetadata.
 */
export interface FileMetadataResult {
  /** Resolved object key */
  key: string;
  /** True if the object exists in the bucket */
  exists: boolean;
  /** ISO 8601 timestamp of the query */
  queriedAt: string;
  /** Content length in bytes (if exists) */
  ContentLength?: number;
  /** MIME content type (if exists) */
  ContentType?: string;
  /** Last modified date (if exists) */
  LastModified?: Date;
  /** Object ETag (if exists) */
  ETag?: string;
  /** Object metadata dictionary */
  Metadata?: Record<string, string>;
  /** Additional S3 HeadObject properties */
  [key: string]: any;
}

/**
 * Result returned by deleteFile.
 */
export interface DeleteFileResult {
  /** Resolved key of the deleted file */
  key: string;
  /** ISO 8601 timestamp of the deletion */
  deletedAt: string;
  [key: string]: any;
}

/**
 * Result returned by deleteFiles (batch delete).
 */
export interface DeleteFilesResult {
  /** Array of S3 batch delete results */
  results: any[];
  /** Number of objects successfully deleted */
  deletedCount: number;
  /** Array of errors encountered during deletion */
  errors: any[];
  /** ISO 8601 timestamp of batch deletion */
  deletedAt: string;
}

/**
 * Result returned by deleteFolder.
 */
export interface DeleteFolderResult {
  /** Batch delete responses */
  results?: any[];
  /** Total count of objects deleted */
  deletedCount: number;
  /** Array of errors encountered */
  errors?: any[];
  /** ISO 8601 timestamp of folder deletion */
  deletedAt: string;
  /** Effective folder prefix targeted */
  prefix?: string;
}

/**
 * Pre-signed URL generation result.
 */
export interface SignedUrlResult {
  /** Generated pre-signed URL string */
  url: string;
  /** Object key */
  key: string;
  /** S3 operation type ('getObject' or 'putObject') */
  operation: string;
  /** Expiration time in seconds */
  expiresIn: number;
  /** ISO 8601 timestamp when the signed URL expires */
  expiresAt: string;
  /** ISO 8601 timestamp when the signed URL was generated */
  generatedAt: string;
}

// ===========================================================================
// Multipart Upload Types
// ===========================================================================

/**
 * Result of initiating a multipart upload.
 */
export interface MultipartUploadInitResult {
  /** Unique multipart upload ID */
  uploadId: string;
  /** Resolved object key */
  key: string;
}

/**
 * Part descriptor for completing a multipart upload.
 */
export interface MultipartPart {
  /** 1-based part number */
  partNumber: number;
  /** ETag hash returned by uploadPart */
  ETag: string;
}

/**
 * Result of uploading a single part in a multipart upload.
 */
export interface UploadPartResult {
  /** ETag hash of the uploaded part */
  ETag: string;
  /** 1-based part number */
  partNumber: number;
}

/**
 * Result of completing a multipart upload.
 */
export interface CompleteMultipartUploadResult {
  /** Resolved object key of the completed object */
  key: string;
  [key: string]: any;
}

/**
 * Result of aborting a multipart upload.
 */
export interface AbortMultipartUploadResult {
  /** Resolved object key */
  key: string;
  /** ISO 8601 timestamp of abortion */
  abortedAt: string;
}

/**
 * Incomplete multipart upload summary.
 */
export interface IncompleteMultipartUpload {
  /** Object key */
  Key?: string;
  /** Multipart upload ID */
  UploadId?: string;
  /** ISO 8601 initiation date string */
  Initiated?: string;
  /** Initiator identity */
  Initiator?: { DisplayName?: string; ID?: string; [key: string]: any };
  /** Owner identity */
  Owner?: { DisplayName?: string; ID?: string; [key: string]: any };
  /** Storage class */
  StorageClass?: string;
  [key: string]: any;
}

/**
 * Result returned by cleanupIncompleteMultipartUploads.
 */
export interface CleanupResult {
  /** Number of multipart uploads successfully aborted */
  abortedCount: number;
  /** Details of aborted uploads */
  uploads: Array<{ key?: string; uploadId?: string; initiated?: string; [key: string]: any }>;
  /** ISO 8601 timestamp of cleanup execution */
  cleanedAt?: string;
  [key: string]: any;
}

// ===========================================================================
// Utility & Error Types
// ===========================================================================

/**
 * Parsed HTTP Byte Range representation.
 */
export interface ParsedRange {
  /** Start byte index (inclusive) */
  start: number;
  /** End byte index (inclusive) */
  end: number;
  /** Total file size in bytes */
  total: number;
  /** Chunk size in bytes (end - start + 1) */
  size: number;
}

/**
 * Classified error structure with HTTP status code and standardized error code.
 */
export interface ClassifiedError {
  /** HTTP status code */
  status: number;
  /** Standardized error code string */
  code: string;
  /** Human-readable error message */
  message: string;
}

/**
 * CLI device-flow authentication options.
 */
export interface DeviceFlowLoginOptions {
  /** mbkauthe server URL (e.g. 'https://auth.example.com') */
  server_url: string;
  /** Optional API token profile key */
  profile_key?: string;
}

/**
 * Result returned after successful device-flow login.
 */
export interface DeviceFlowLoginResult {
  /** Device flow bearer token */
  token: string;
  /** Truncated token prefix */
  token_prefix: string;
  /** Authenticated username */
  username: string;
  /** Profile payload if returned */
  profile?: any;
}

// ===========================================================================
// S3 Service Functions (Re-exported at root from lib/src/services/s3.service.js)
// ===========================================================================

/**
 * Returns an array of all configured bucket names from the `BucketConnection` environment variable.
 */
export function getAvailableBucketNames(): string[];

/**
 * Resolves and validates a bucket name candidate, falling back to mbkautheVar.bucket or the first configured bucket.
 * @throws Error if no bucket is selected or the bucket is not found in BucketConnection.
 */
export function resolveBucketName(bucketName?: string | null): string;

/**
 * Retrieves the parsed BucketConfig for a specified or default bucket.
 */
export function getBucketConfig(bucketName?: string): BucketConfig;

/**
 * Instantiates or retrieves a cached S3Client instance for the specified bucket.
 */
export function getBucketClient(bucketName?: string): S3Client;

/**
 * Retrieves both the S3Client and BucketConfig for the specified or default bucket.
 */
export function getBucketClientAndConfig(bucketName?: string): BucketClientAndConfig;

/**
 * Proxy object pointing to the default S3Client instance.
 */
export const bucketClient: S3Client;

/**
 * Returns the sanitized application name configured in mbkautheVar.APP_NAME.
 */
export function getAppName(): string;

/**
 * Ensures a key has the required APP_NAME prefix unless running in root mode ('portal' or 'mbkbucket').
 * @throws Error if path traversal is detected or APP_NAME is missing when required.
 */
export function ensureKeyHasAppPrefix(key?: string | string[]): string;

/**
 * Ensures a prefix string has the required APP_NAME prefix unless running in root mode.
 */
export function ensurePrefix(prefix?: string | string[]): string;

/**
 * Performs a health check against the default bucket using a lightweight ListObjects request.
 */
export function checkHealth(): Promise<HealthCheckResult>;

/**
 * Runs a health check against the default bucket and logs the connectivity result.
 */
export function runHealthCheck(): Promise<void>;

/**
 * Uploads a file buffer or byte array to S3/R2.
 * @param key Destination S3 key.
 * @param fileBuffer File contents buffer or Uint8Array.
 * @param contentType MIME content type string.
 * @param options Additional upload options.
 */
export function uploadFile(
  key: string,
  fileBuffer: Buffer | Uint8Array,
  contentType?: string,
  options?: UploadOptions
): Promise<UploadResult>;

/**
 * Downloads a file from S3/R2 as a readable stream with optional range/conditional headers.
 * @param key Target S3 key.
 * @param options Download options (range, etag, bucketName, etc.).
 */
export function downloadFile(
  key: string,
  options?: DownloadOptions
): Promise<DownloadResult>;

/**
 * Deletes a single file from S3/R2.
 * @param key S3 key of the object to delete.
 * @param bucketName Target bucket identifier name.
 */
export function deleteFile(key: string, bucketName?: string): Promise<DeleteFileResult>;

/**
 * Deletes multiple files in batches of up to 1000 objects.
 * @param keys Array of S3 keys to delete.
 * @param bucketName Target bucket identifier name.
 */
export function deleteFiles(keys: string[], bucketName?: string): Promise<DeleteFilesResult>;

/**
 * Recursively deletes all files and subfolders under the specified folder prefix.
 * @param prefix Folder prefix to delete.
 * @param bucketName Target bucket identifier name.
 */
export function deleteFolder(prefix: string, bucketName?: string): Promise<DeleteFolderResult>;

/**
 * Lists files and folders in S3/R2 with support for prefixes, pagination, and delimiters.
 * @param prefix Optional key prefix to filter by.
 * @param options Listing options (maxKeys, continuationToken, delimiter, bucketName, etc.).
 */
export function listfiles(prefix?: string, options?: ListFilesOptions): Promise<ListFilesResult>;

/**
 * Retrieves object metadata via S3 HeadObject without downloading the file body.
 * @param key Target S3 key.
 * @param bucketName Target bucket identifier name.
 */
export function getFileMetadata(key: string, bucketName?: string): Promise<FileMetadataResult>;

/**
 * Checks whether a file exists in the bucket.
 * @param key Target S3 key.
 * @param bucketName Target bucket identifier name.
 */
export function fileExists(key: string, bucketName?: string): Promise<boolean>;

/**
 * Retrieves the file size in bytes for a key, or null if the file does not exist.
 * @param key Target S3 key.
 * @param bucketName Target bucket identifier name.
 */
export function getFileSize(key: string, bucketName?: string): Promise<number | null>;

/**
 * Generates a pre-signed URL for temporary direct access to S3/R2.
 * @param key Target S3 key.
 * @param operation S3 operation: 'getObject' (default) or 'putObject'.
 * @param expiresIn URL lifetime in seconds (default: 3600).
 * @param bucketName Target bucket identifier name.
 */
export function generateSignedUrl(
  key: string,
  operation?: "getObject" | "putObject" | string,
  expiresIn?: number,
  bucketName?: string
): Promise<SignedUrlResult>;

/**
 * Initiates an S3 multipart upload for large files.
 * @param key Target S3 key.
 * @param contentType MIME content type (default: 'application/octet-stream').
 * @param metadata Custom metadata key-value pairs.
 * @param bucketName Target bucket identifier name.
 */
export function createMultipartUpload(
  key: string,
  contentType?: string,
  metadata?: Record<string, string>,
  bucketName?: string
): Promise<MultipartUploadInitResult>;

/**
 * Uploads an individual part in a multipart upload.
 * @param key Target S3 key.
 * @param uploadId Multipart upload ID from createMultipartUpload.
 * @param partNumber 1-based part number.
 * @param buffer Part data buffer or Uint8Array.
 * @param bucketName Target bucket identifier name.
 */
export function uploadPart(
  key: string,
  uploadId: string,
  partNumber: number,
  buffer: Buffer | Uint8Array,
  bucketName?: string
): Promise<UploadPartResult>;

/**
 * Completes a multipart upload by assembling uploaded parts in order.
 * @param key Target S3 key.
 * @param uploadId Multipart upload ID.
 * @param parts Array of parts with partNumber and ETag.
 * @param bucketName Target bucket identifier name.
 */
export function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: MultipartPart[],
  bucketName?: string
): Promise<CompleteMultipartUploadResult>;

/**
 * Aborts an active multipart upload and frees associated storage.
 * @param key Target S3 key.
 * @param uploadId Multipart upload ID to abort.
 * @param bucketName Target bucket identifier name.
 */
export function abortMultipartUpload(
  key: string,
  uploadId: string,
  bucketName?: string
): Promise<AbortMultipartUploadResult>;

/**
 * Lists incomplete/aborted multipart uploads in the bucket.
 * @param prefix Optional prefix filter.
 * @param bucketName Target bucket identifier name.
 */
export function listIncompleteMultipartUploads(
  prefix?: string,
  bucketName?: string
): Promise<IncompleteMultipartUpload[]>;

/**
 * Aborts incomplete multipart uploads initiated older than the specified number of days.
 * @param olderThanDays Age threshold in days (default: 7).
 * @param prefix Optional prefix filter.
 * @param bucketName Target bucket identifier name.
 */
export function cleanupIncompleteMultipartUploads(
  olderThanDays?: number,
  prefix?: string,
  bucketName?: string
): Promise<CleanupResult>;

// ===========================================================================
// Config Exports (Re-exported from lib/src/config/index.js at root)
// ===========================================================================

/**
 * Loaded package.json of mbkbucket.
 */
export const packageJson: Record<string, any>;

/**
 * Detected version of the host application.
 */
export const appVersion: string;

/**
 * Parsed and validated configuration variables for mbkbucket.
 */
export const mbkbucketVar: ConfigVars;

/**
 * Compares two semantic version strings. Returns > 0 if a > b, < 0 if a < b, 0 if equal.
 */
export function compareVersions(a?: string, b?: string): number;

/**
 * Fetches the latest published mbkbucket version from GitHub.
 */
export function getLatestVersion(): Promise<string | null>;

/**
 * Checks GitHub for newer versions of mbkbucket and logs a warning if an update is available.
 */
export function checkVersion(): Promise<void>;

/**
 * Validates process.env.mbkbucketVar and returns the parsed ConfigVars.
 */
export function validateConfiguration(): ConfigVars;

/**
 * Validates process.env.BucketConnection JSON structure and required fields.
 */
export function validateBucketConnection(): void;

/**
 * Validates both mbkbucketVar and BucketConnection configurations.
 * Returns true if valid, false otherwise.
 */
export function validateAllConfiguration(): boolean;

/**
 * Normalizes boolean-like values ('true', '1', 'yes', 'on' -> true; 'false', '0', 'no', 'off' -> false).
 */
export function normalizeBooleanLike(value: any): boolean | any;

/**
 * Parses and validates raw JSON string for mbkbucketVar.
 */
export function parseAndValidateMbkbucketVar(rawValue?: string): ConfigVars;

/**
 * Parses and validates raw JSON string for BucketConnection.
 */
export function parseAndValidateBucketConnection(rawValue?: string): BucketConnectionMap | null;

// ===========================================================================
// Application Factory & Utility Functions
// ===========================================================================

/**
 * Creates and configures the mbkbucket Express application instance.
 */
export function createApp(): Application;

/**
 * HTML escapes string content.
 */
export function escapeHtml(value?: any): string;

/**
 * Extracts the base file name from a path.
 */
export function getBaseName(path?: string): string;

/**
 * Extracts the lowercased file extension without leading dot.
 */
export function getFileExt(fileName?: string): string;

/**
 * Trims leading and trailing slashes from a string.
 */
export function trimSlashes(str?: string): string;

/**
 * Trims leading slashes from a string.
 */
export function trimLeadingSlashes(str?: string): string;

/**
 * Extracts folder path prefix ending with a slash, or empty string.
 */
export function getFolderPath(key?: string): string;

/**
 * Normalizes a key parameter from string or array to a single path string.
 */
export function normalizeKeyParam(rawKey: any): string;

/**
 * Combines prefix and filename into a normalized key path.
 */
export function buildKey(prefix: string, fileName: string): string;

/**
 * Returns current timestamp in ISO 8601 format.
 */
export function nowIso(): string;

/**
 * Formats a byte size into human readable string (e.g. '12.5 MB').
 */
export function formatBytes(bytes?: number): string;

/**
 * Formats an ISO date into localized display string.
 */
export function formatDate(iso?: string): string;

/**
 * Converts a Node or web stream to a Buffer.
 */
export function streamToBuffer(stream: any): Promise<Buffer>;

/**
 * Safely destroys a stream and removes event listeners.
 */
export function destroyStream(stream: any): void;

/** Set of viewable file extensions */
export const VIEWABLE_TYPES: Set<string>;

/** Alphabetically sorted list of viewable file extensions */
export const VIEWABLE_TYPES_SORTED: string[];

/** Set of static asset extensions (images/css/js) */
export const STATIC_ASSET_TYPES: Set<string>;

/** Set of supported video file extensions */
export const VIDEO_TYPES: Set<string>;

/** Set of supported audio file extensions */
export const AUDIO_TYPES: Set<string>;

/** Map of file extensions to MIME types */
export const MIME_TYPES: Record<string, string>;

/**
 * Looks up MIME type for a filename with fallback.
 */
export function getMimeType(fileName: string, fallback?: string): string;

/**
 * Checks whether content type is sensitive text (code/JSON/XML/text).
 */
export function isSensitiveTextType(contentType?: string): boolean;

/**
 * Constructs appropriate Cache-Control header based on content type and options.
 */
export function buildCacheControl(
  contentType?: string,
  options?: { isStaticAsset?: boolean; supportsRanges?: boolean; publicCache?: boolean }
): string;

/**
 * Parses HTTP Range header against total file size.
 */
export function parseRangeHeader(
  rangeHeader?: string,
  totalSize?: number
): ParsedRange | null;

/**
 * Renders standalone HTML page for video media player.
 */
export function renderPlayerPage(safeFileName: string, encodedKey: string, bucketQuery: string): string;

/** Common Handlebars helper functions */
export const commonHandlebarsHelpers: Record<string, (...args: any[]) => any>;

/**
 * Maps error to API HTTP status code and standardized error code.
 */
export function classifyApiError(error: any, fallbackMessage?: string): ClassifiedError;

/**
 * Maps error to View HTTP status code and standardized error code.
 */
export function classifyViewError(error: any, fallbackMessage?: string): ClassifiedError;

/**
 * Sends standardized API error JSON response.
 */
export function sendApiError(res: Response, error: any, fallbackMessage?: string): Response;

/**
 * Sends standardized View error JSON response.
 */
export function sendViewError(res: Response, error: any, fallbackMessage?: string): Response;

/**
 * Creates a debug logger instance prefixed with `mbkbucket:`.
 */
export function createLogger(namespace: string): Debugger;

// ===========================================================================
// Middleware
// ===========================================================================

/** Middleware resolving ?bucket= query parameter to req.activeBucket */
export const bucketResolver: RequestHandler;

/** Guard middleware ensuring a valid bucket is selected for API routes */
export const requireBucketApi: RequestHandler;

/** Guard middleware ensuring a valid bucket is selected for View routes */
export const requireBucketView: RequestHandler;

/** Rate limiter middleware for general mbkbucket routes */
export const generalLimiter: RequestHandler;

/** Rate limiter middleware for public file view (p_view) routes */
export const pviewRateLimit: RequestHandler;

/** 404 handler for mbkbucket routes */
export const notFoundHandler: RequestHandler;

/** Global error handler middleware */
export const globalErrorHandler: ErrorRequestHandler;

/** Security middleware blocking automated scrapers on p_view routes */
export const pviewSecurity: RequestHandler;

/**
 * Wraps async route handlers to forward unhandled rejections to next().
 */
export function wrap(
  handler: RequestHandler,
  onError?: (err: any, req: Request, res: Response, next: NextFunction) => void
): RequestHandler;

/**
 * Wraps async API route handlers with standardized 500 JSON error handler.
 */
export function wrapApi(handler: RequestHandler, fallbackMessage?: string): RequestHandler;

// ===========================================================================
// CLI Auth Helpers
// ===========================================================================

/** Directory where CLI config is stored (~/.mbkbucket) */
export const CONFIG_DIR: string;

/** Path to CLI config file (~/.mbkbucket/config.json) */
export const CONFIG_FILE: string;

/** Reads CLI configuration from disk */
export function readConfig(): Record<string, any>;

/** Writes CLI configuration to disk */
export function writeConfig(config: Record<string, any>): void;

/** Clears stored CLI configuration file */
export function clearConfig(): boolean;

/** Updates stored CLI configuration with partial data */
export function updateConfig(partial: Record<string, any>): Record<string, any>;

/** Checks if valid CLI token and server_url are stored */
export function isLoggedIn(): boolean;

/** Retrieves stored CLI token */
export function getStoredToken(): string | null;

/** Retrieves stored CLI server URL */
export function getStoredServerUrl(): string | null;

/** Performs mbkauthe device flow login for CLI */
export function deviceFlowLogin(options: DeviceFlowLoginOptions): Promise<DeviceFlowLoginResult>;

// ===========================================================================
// Router & Server Exports
// ===========================================================================

/**
 * Express router mounting all mbkbucket API, View, and Info routes (`/mbkbucket/...`).
 */
export const bucket: Router;

/**
 * Fully configured Express Application instance (default export).
 */
declare const server: Application;
export default server;