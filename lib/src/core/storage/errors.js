/**
 * MBKBucket - Typed Storage Error Hierarchy
 * Copyright (c) 2026 Muhammad Bin Khalid, MBKTech.org and contributors
 * Licensed under the MIT License.
 */

export class StorageError extends Error {
  /**
   * @param {string} message
   * @param {number} [status=500]
   * @param {string} [code='INTERNAL_STORAGE_ERROR']
   */
  constructor(message, status = 500, code = 'INTERNAL_STORAGE_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class StorageNotFoundError extends StorageError {
  constructor(message = 'File or folder not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class StorageAccessDeniedError extends StorageError {
  constructor(message = 'Access denied') {
    super(message, 403, 'ACCESS_DENIED');
  }
}

export class StorageConflictError extends StorageError {
  constructor(message = 'Resource already exists') {
    super(message, 409, 'CONFLICT');
  }
}

export class StorageValidationError extends StorageError {
  constructor(message = 'Validation failed') {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class StorageConfigError extends StorageError {
  constructor(message = 'Storage configuration error') {
    super(message, 503, 'STORAGE_CONFIG_ERROR');
  }
}

export class StorageQuotaExceededError extends StorageError {
  constructor(message = 'Storage quota exceeded') {
    super(message, 507, 'QUOTA_EXCEEDED');
  }
}

export class StorageUnsupportedOperationError extends StorageError {
  constructor(message = 'Operation not supported by this storage provider') {
    super(message, 501, 'NOT_IMPLEMENTED');
  }
}
