// Type definitions for mbkbucket
// Project: https://github.com/MIbnEKhalid/mbkbucket

import { Readable } from "stream";
import { Router, Application } from "express";

/**
 * Shared types used across the package
 */
export interface BucketConfig {
  BUCKET_NAME: string;
  ENDPOINT?: string;
  ACCESS_KEY_ID?: string;
  SECRET_ACCESS_KEY?: string;
  region?: string;
  [key: string]: any;
}

export type BucketConnectionMap = Record<string, BucketConfig>;

export interface S3ObjectResult {
  Body: Readable;
  ContentLength?: number;
  ContentType?: string;
  LastModified?: Date;
  Key?: string;
  [key: string]: any;
}

export interface UploadOptions {
  metadata?: Record<string, string>;
  cacheControl?: string;
  storageClass?: string;
  serverSideEncryption?: string;
  bucketName?: string;
  preventOverwrite?: boolean;
  [key: string]: any;
}

export interface ListFilesOptions {
  maxKeys?: number;
  continuationToken?: string | null;
  delimiter?: string | null;
  fetchOwner?: boolean;
  startAfter?: string | null;
  bucketName?: string;
  [key: string]: any;
}

export interface ListFilesResult extends Record<string, any> {
  requestedAt: string;
  totalFiles: number;
  hasMore: boolean;
  nextToken: string | null;
}

export interface IncompleteMultipartUpload {
  Key?: string;
  UploadId?: string;
  Initiated?: string;
  Initiator?: { DisplayName?: string; [key: string]: any };
  [key: string]: any;
}

export interface CleanupResult {
  abortedCount: number;
  uploads: Array<{ key: string; uploadId: string; initiated?: string }>;
  cleanedAt?: string;
  [key: string]: any;
}

export interface ConfigVars {
  publiView_enabled: boolean;
  p_view_inline: boolean;
  [key: string]: any;
}

/**
 * S3 exports (re-exported from lib/s3.js at package root)
 */
export function getAvailableBucketNames(): string[];
export function resolveBucketName(bucketName?: string | null): string;
export function getBucketConfig(bucketName?: string): BucketConfig;
export const bucketClient: any;
export function getAppName(): string;
export function ensureKeyHasAppPrefix(key?: string): string;
export function ensurePrefix(prefix?: string): string;
export function getBucketClient(bucketName?: string): any;
export function checkHealth(): Promise<{ status: string; responseTime?: number; bucket?: string; error?: string; checkedAt: string; region?: string; }>;

export function uploadFile(
  key: string,
  fileBuffer: Buffer | Uint8Array,
  contentType: string,
  options?: UploadOptions
): Promise<{ fileSize?: number; key: string; contentType?: string; uploadedAt?: string; } & Record<string, any>>;

export function downloadFile(
  key: string,
  options?: {
    range?: string | null;
    ifNoneMatch?: string | null;
    ifModifiedSince?: Date | string | null;
    responseCacheControl?: string | null;
    responseContentType?: string | null;
    bucketName?: string;
    [key: string]: any;
  }
): Promise<S3ObjectResult>;

export function deleteFile(key: string, bucketName?: string): Promise<{ key: string; deletedAt?: string } & Record<string, any>>;

export function deleteFiles(keys: string[], bucketName?: string): Promise<{
  results: any[];
  deletedCount: number;
  errors: any[];
  deletedAt: string;
}>;

export function deleteFolder(prefix: string, bucketName?: string): Promise<{
  results?: any[];
  deletedCount: number;
  errors?: any[];
  deletedAt: string;
  prefix?: string;
}>;

export function listfiles(prefix?: string, options?: ListFilesOptions): Promise<ListFilesResult>;

export function getFileMetadata(key: string, bucketName?: string): Promise<{
  key: string;
  exists: boolean;
  queriedAt: string;
  ContentLength?: number;
  ContentType?: string;
  LastModified?: Date;
  [key: string]: any;
}>;

export function fileExists(key: string, bucketName?: string): Promise<boolean>;
export function getFileSize(key: string, bucketName?: string): Promise<number | null>;

export function generateSignedUrl(
  key: string,
  operation?: "getObject" | "putObject" | string,
  expiresIn?: number,
  bucketName?: string
): Promise<{
  url: string;
  key: string;
  operation: string;
  expiresIn: number;
  expiresAt: string;
  generatedAt: string;
}>;

export function createMultipartUpload(
  key: string,
  contentType?: string,
  metadata?: Record<string, string>,
  bucketName?: string
): Promise<{ uploadId: string; key: string }>;

export function uploadPart(
  key: string,
  uploadId: string,
  partNumber: number,
  buffer: Buffer | Uint8Array,
  bucketName?: string
): Promise<{ ETag: string; partNumber: number }>;

export function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: Array<{ partNumber: number; ETag: string }>,
  bucketName?: string
): Promise<{ key: string }>;

export function abortMultipartUpload(
  key: string,
  uploadId: string,
  bucketName?: string
): Promise<{ key: string; abortedAt: string }>;

export function listIncompleteMultipartUploads(
  prefix?: string,
  bucketName?: string
): Promise<IncompleteMultipartUpload[]>;

export function cleanupIncompleteMultipartUploads(
  olderThanDays?: number,
  prefix?: string,
  bucketName?: string
): Promise<CleanupResult>;

/**
 * Config exports (re-exported from lib/config/index.js at package root)
 */
export const packageJson: Record<string, any>;
export const appVersion: string;
export const mbkbucketVar: ConfigVars;
export function getLatestVersion(): Promise<string | null>;
export function checkVersion(): Promise<void>;
export function parseAndValidateMbkbucketVar(rawValue?: string): ConfigVars;
export function parseAndValidateBucketConnection(rawValue?: string): BucketConnectionMap | null;

/**
 * Router export (re-exported from lib/routes/index.js at package root as `bucket`)
 */
export const bucket: Router;

/**
 * Root default export from index.js: configured Express application
 */
declare const server: Application;
export default server;

/**
 * Subpath module declarations
 */
declare module "mbkbucket/lib/s3" {
  import { Readable } from "stream";

  export interface BucketConfig {
    BUCKET_NAME: string;
    ENDPOINT?: string;
    ACCESS_KEY_ID?: string;
    SECRET_ACCESS_KEY?: string;
    region?: string;
    [key: string]: any;
  }

  export type BucketConnectionMap = Record<string, BucketConfig>;

  export interface S3ObjectResult {
    Body: Readable;
    ContentLength?: number;
    ContentType?: string;
    LastModified?: Date;
    Key?: string;
    [key: string]: any;
  }

  export interface UploadOptions {
    metadata?: Record<string, string>;
    cacheControl?: string;
    storageClass?: string;
    serverSideEncryption?: string;
    bucketName?: string;
    preventOverwrite?: boolean;
    [key: string]: any;
  }

  export interface ListFilesOptions {
    maxKeys?: number;
    continuationToken?: string | null;
    delimiter?: string | null;
    fetchOwner?: boolean;
    startAfter?: string | null;
    bucketName?: string;
    [key: string]: any;
  }

  export interface ListFilesResult extends Record<string, any> {
    requestedAt: string;
    totalFiles: number;
    hasMore: boolean;
    nextToken: string | null;
  }

  export interface IncompleteMultipartUpload {
    Key?: string;
    UploadId?: string;
    Initiated?: string;
    Initiator?: { DisplayName?: string; [key: string]: any };
    [key: string]: any;
  }

  export interface CleanupResult {
    abortedCount: number;
    uploads: Array<{ key: string; uploadId: string; initiated?: string }>;
    cleanedAt?: string;
    [key: string]: any;
  }

  export function getAvailableBucketNames(): string[];
  export function resolveBucketName(bucketName?: string | null): string;
  export function getBucketConfig(bucketName?: string): BucketConfig;
  export const bucketClient: any;
  export function getAppName(): string;
  export function ensureKeyHasAppPrefix(key?: string): string;
  export function ensurePrefix(prefix?: string): string;
  export function getBucketClient(bucketName?: string): any;
  export function checkHealth(): Promise<{ status: string; responseTime?: number; bucket?: string; error?: string; checkedAt: string; region?: string; }>;

  export function uploadFile(
    key: string,
    fileBuffer: Buffer | Uint8Array,
    contentType: string,
    options?: UploadOptions
  ): Promise<{ fileSize?: number; key: string; contentType?: string; uploadedAt?: string } & Record<string, any>>;

  export function downloadFile(
    key: string,
    options?: {
      range?: string | null;
      ifNoneMatch?: string | null;
      ifModifiedSince?: Date | string | null;
      responseCacheControl?: string | null;
      responseContentType?: string | null;
      bucketName?: string;
      [key: string]: any;
    }
  ): Promise<S3ObjectResult>;

  export function deleteFile(key: string, bucketName?: string): Promise<{ key: string; deletedAt?: string } & Record<string, any>>;
  export function deleteFiles(keys: string[], bucketName?: string): Promise<{
    results: any[];
    deletedCount: number;
    errors: any[];
    deletedAt: string;
  }>;

  export function deleteFolder(prefix: string, bucketName?: string): Promise<{
    results?: any[];
    deletedCount: number;
    errors?: any[];
    deletedAt: string;
    prefix?: string;
  }>;

  export function listfiles(prefix?: string, options?: ListFilesOptions): Promise<ListFilesResult>;

  export function getFileMetadata(key: string, bucketName?: string): Promise<{
    key: string;
    exists: boolean;
    queriedAt: string;
    ContentLength?: number;
    ContentType?: string;
    LastModified?: Date;
    [key: string]: any;
  }>;

  export function fileExists(key: string, bucketName?: string): Promise<boolean>;
  export function getFileSize(key: string, bucketName?: string): Promise<number | null>;

  export function generateSignedUrl(
    key: string,
    operation?: "getObject" | "putObject" | string,
    expiresIn?: number,
    bucketName?: string
  ): Promise<{
    url: string;
    key: string;
    operation: string;
    expiresIn: number;
    expiresAt: string;
    generatedAt: string;
  }>;

  export function createMultipartUpload(
    key: string,
    contentType?: string,
    metadata?: Record<string, string>,
    bucketName?: string
  ): Promise<{ uploadId: string; key: string }>;

  export function uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    buffer: Buffer | Uint8Array,
    bucketName?: string
  ): Promise<{ ETag: string; partNumber: number }>;

  export function completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: Array<{ partNumber: number; ETag: string }>,
    bucketName?: string
  ): Promise<{ key: string }>;

  export function abortMultipartUpload(
    key: string,
    uploadId: string,
    bucketName?: string
  ): Promise<{ key: string; abortedAt: string }>;

  export function listIncompleteMultipartUploads(
    prefix?: string,
    bucketName?: string
  ): Promise<IncompleteMultipartUpload[]>;

  export function cleanupIncompleteMultipartUploads(
    olderThanDays?: number,
    prefix?: string,
    bucketName?: string
  ): Promise<CleanupResult>;
}

declare module "mbkbucket/lib/config/index" {
  export interface ConfigVars {
    publiView_enabled: boolean;
    p_view_inline: boolean;
    [key: string]: any;
  }

  export interface BucketConfig {
    BUCKET_NAME: string;
    ENDPOINT?: string;
    ACCESS_KEY_ID?: string;
    SECRET_ACCESS_KEY?: string;
    region?: string;
    [key: string]: any;
  }

  export type BucketConnectionMap = Record<string, BucketConfig>;

  export const packageJson: Record<string, any>;
  export const appVersion: string;
  export const mbkbucketVar: ConfigVars;
  export function getLatestVersion(): Promise<string | null>;
  export function checkVersion(): Promise<void>;
  export function parseAndValidateMbkbucketVar(rawValue?: string): ConfigVars;
  export function parseAndValidateBucketConnection(rawValue?: string): BucketConnectionMap | null;
}

declare module "mbkbucket/lib/config/validation" {
  export function normalizeBooleanLike(value: any): any;
  export function parseAndValidateMbkbucketVar(rawValue?: string): { [key: string]: any };
  export function parseAndValidateBucketConnection(rawValue?: string): Record<string, any> | null;
}

declare module "mbkbucket/lib/routes/index" {
  import { Router } from "express";
  const router: Router;
  export default router;
}

declare module "mbkbucket/lib/bucket" {
  import { Router } from "express";
  const router: Router;
  export default router;
}