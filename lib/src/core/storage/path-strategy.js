/**
 * MBKBucket - Path & Key Strategy
 * Copyright (c) 2026 Muhammad Bin Khalid, MBKTech.org and contributors
 * Licensed under the MIT License.
 */

import { mbkautheVar } from "mbkauthe";
import { StorageValidationError } from "./errors.js";
import { trimLeadingSlashes, trimSlashes } from "#helpers";

const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class PathStrategy {
  static getAppName() {
    const app = mbkautheVar?.APP_NAME;
    return typeof app === 'string' && app.trim() ? app.trim() : '';
  }

  static isRootModeApp(appName) {
    return ['portal', 'mbkbucket'].includes(String(appName || '').toLowerCase());
  }

  static validateSafety(str, isKey = false) {
    if (isKey && !str) throw new StorageValidationError('Key is required');
    if (str && (str.includes('../') || str.includes('..\\') || /\.\.[\\/]/.test(str))) {
      throw new StorageValidationError(`Path traversal detected: invalid ${isKey ? 'key' : 'prefix'}`);
    }
    if (str && /[\x00-\x1f\x7f]/.test(str)) {
      throw new StorageValidationError(`Invalid characters in ${isKey ? 'key' : 'prefix'}`);
    }
  }

  static applyKeyPrefix(key = '') {
    if (Array.isArray(key)) key = key.join('/');
    this.validateSafety(key, true);

    const app = this.getAppName();
    const cleaned = trimLeadingSlashes(key);
    if (this.isRootModeApp(app)) return cleaned;
    if (!app) throw new StorageValidationError('APP_NAME is not configured; set mbkautheVar.APP_NAME or MBKAUTHE_APP_NAME');

    const appPrefixRegex = new RegExp(`^(?:${escapeRegExp(app)}\/)+`);
    return cleaned.startsWith(`${app}/`) ? cleaned.replace(appPrefixRegex, `${app}/`) : `${app}/${cleaned}`;
  }

  static applyPrefix(prefix = '') {
    if (Array.isArray(prefix)) prefix = prefix.join('/');
    this.validateSafety(prefix, false);

    const app = this.getAppName();
    const p = trimLeadingSlashes(prefix);
    if (this.isRootModeApp(app)) return p;
    if (!app) throw new StorageValidationError('APP_NAME is not configured; set mbkautheVar.APP_NAME or MBKAUTHE_APP_NAME');
    if (!p || p === app || p === `${app}/`) return p || app;

    return p.startsWith(`${app}/`)
      ? p.replace(new RegExp(`^(?:${escapeRegExp(app)}\/)+`), `${app}/`)
      : `${app}/${p}`;
  }

  static normalizeFolderPrefix(prefix = '') {
    const p = this.applyPrefix(trimSlashes(prefix));
    return p ? `${p}/` : '';
  }
}
