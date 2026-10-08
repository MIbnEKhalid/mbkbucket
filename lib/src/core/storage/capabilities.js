/**
 * MBKBucket - Storage Provider Capabilities
 * Copyright (c) 2026 Muhammad Bin Khalid, MBKTech.org and contributors
 * Licensed under the MIT License.
 */

import { StorageUnsupportedOperationError } from "./errors.js";

export class StorageCapabilities {
  constructor(flags = {}) {
    this.multipart = Boolean(flags.multipart);
    this.resumable = Boolean(flags.resumable ?? flags.multipart);
    this.nativeFolders = Boolean(flags.nativeFolders);
    this.ranges = Boolean(flags.ranges ?? true);
    this.copy = Boolean(flags.copy);
    this.move = Boolean(flags.move);
    this.search = Boolean(flags.search);
    this.directDownloadUrl = Boolean(flags.directDownloadUrl);
    this.versioning = Boolean(flags.versioning);
    this.publicUrls = Boolean(flags.publicUrls);
    this.storageQuota = Boolean(flags.storageQuota);
    this.deleteBatch = Boolean(flags.deleteBatch ?? true);
    this.metadata = Boolean(flags.metadata ?? true);

    Object.freeze(this);
  }

  has(capability) {
    return Boolean(this[capability]);
  }

  assert(capability, operationName, providerType = 'storage provider') {
    if (!this.has(capability)) {
      const op = operationName || capability;
      throw new StorageUnsupportedOperationError(
        `Operation '${op}' is not supported by ${providerType} (missing capability: ${capability})`
      );
    }
  }

  toJSON() {
    return {
      multipart: this.multipart,
      resumable: this.resumable,
      nativeFolders: this.nativeFolders,
      ranges: this.ranges,
      copy: this.copy,
      move: this.move,
      search: this.search,
      directDownloadUrl: this.directDownloadUrl,
      versioning: this.versioning,
      publicUrls: this.publicUrls,
      storageQuota: this.storageQuota,
      deleteBatch: this.deleteBatch,
      metadata: this.metadata
    };
  }
}
