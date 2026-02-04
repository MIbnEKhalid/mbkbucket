// Type definitions for mbkbucket 1.2.1
// Project: https://github.com/MIbnEKhalid/mbkbucket
// Definitions by: Muhammad Bin Khalid <https://github.com/MIbnEKhalid">

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

export interface S3ObjectResult {
  Body: Readable;
  ContentLength?: number;
  ContentType?: string;
  LastModified?: Date;
  Key?: string;
  [key: string]: any;
}

/**
 * S3-related functions (available from `mbkbucket/lib/s3` and re-exported at package root)
 */
export function getBucketConfig(bucketName?: string): BucketConfig;
export const bucketClient: any;
export function getAppName(): string;
export function ensureKeyHasAppPrefix(key?: string): string;
export function ensurePrefix(prefix?: string): string;
export function getBucketClient(bucketName?: string): any;
export function checkR2Health(): Promise<{ status: string; responseTime?: number; bucket?: string; error?: string; checkedAt: string; region?: string }>;

export function uploadFile(
  key: string,
  fileBuffer: Buffer | Uint8Array,
  contentType: string,
  options?: {
    metadata?: Record<string, string>;
    cacheControl?: string;
    storageClass?: string;
    serverSideEncryption?: string;
    bucketName?: string;
    [key: string]: any;
  }
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

export function listfiles(
  prefix?: string,
  options?: {
    maxKeys?: number;
    continuationToken?: string | null;
    delimiter?: string | null;
    fetchOwner?: boolean;
    startAfter?: string | null;
    bucketName?: string;
    [key: string]: any;
  }
): Promise<Record<string, any>>;

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
  operation?: 'getObject' | 'putObject' | string,
  expiresIn?: number
): Promise<{
  url: string;
  key: string;
  operation: string;
  expiresIn: number;
  expiresAt: string;
  generatedAt: string;
}>;

/**
 * Exported router from `lib/bucket` (re-exported at package root as `bucket`)
 */
export const bucket: Router;

/**
 * Root default export: the configured Express application
 */
declare const server: Application;
export default server;

/**
 * Module declarations for subpath imports so TypeScript consumers can import:
 * import { uploadFile } from 'mbkbucket/lib/s3';
 * import { packageJson } from 'mbkbucket/lib/config/index';
 * import bucketRouter from 'mbkbucket/lib/bucket';
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
  export interface S3ObjectResult {
    Body: Readable;
    ContentLength?: number;
    ContentType?: string;
    LastModified?: Date;
    Key?: string;
    [key: string]: any;
  }
  export function getBucketConfig(bucketName?: string): BucketConfig;
  export const bucketClient: any;
  export function getAppName(): string;
  export function ensureKeyHasAppPrefix(key?: string): string;
  export function ensurePrefix(prefix?: string): string;
  export function getBucketClient(bucketName?: string): any;
  export function checkR2Health(): Promise<{ status: string; responseTime?: number; bucket?: string; error?: string; checkedAt: string; region?: string }>;
  export function uploadFile(
    key: string,
    fileBuffer: Buffer | Uint8Array,
    contentType: string,
    options?: {
      metadata?: Record<string, string>;
      cacheControl?: string;
      storageClass?: string;
      serverSideEncryption?: string;
      bucketName?: string;
      [key: string]: any;
    }
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
  export function listfiles(
    prefix?: string,
    options?: {
      maxKeys?: number;
      continuationToken?: string | null;
      delimiter?: string | null;
      fetchOwner?: boolean;
      startAfter?: string | null;
      bucketName?: string;
      [key: string]: any;
    }
  ): Promise<Record<string, any>>;
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
    operation?: 'getObject' | 'putObject' | string,
    expiresIn?: number
  ): Promise<{
    url: string;
    key: string;
    operation: string;
    expiresIn: number;
    expiresAt: string;
    generatedAt: string;
  }>;
}

declare module "mbkbucket/lib/config/index" {
  export const packageJson: Record<string, any>;
  export const appVersion: string;
  export function getLatestVersion(): Promise<string | null>;
  export function checkVersion(): Promise<void>;
}

declare module "mbkbucket/lib/bucket" {
  import { Router } from "express";
  const router: Router;
  export default router;
}