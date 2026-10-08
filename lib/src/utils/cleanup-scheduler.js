/**
 * MBKBucket - Incomplete Multipart Upload Cleanup Scheduler
 * Copyright (c) 2026 Muhammad Bin Khalid, MBKTech.org and contributors
 * Licensed under the MIT License.
 */

import { cleanupIncompleteMultipartUploads, getAvailableStorageNames } from "../services/storage.service.js";
import { createLogger } from "#logger";

const debugCleanup = createLogger('cleanup-scheduler');

export class CleanupScheduler {
  constructor() {
    this._timer = null;
    this._running = false;
    this._lastRun = null;
    this._lastStats = null;
  }

  async runOnce({ olderThanDays = 7, connectionNames = null } = {}) {
    const targets = connectionNames && Array.isArray(connectionNames) && connectionNames.length > 0
      ? connectionNames
      : getAvailableStorageNames();

    const summary = {
      startedAt: new Date().toISOString(),
      connectionsProcessed: 0,
      totalAborted: 0,
      errors: []
    };

    for (const name of targets) {
      try {
        const result = await cleanupIncompleteMultipartUploads(olderThanDays, '', name);
        summary.connectionsProcessed++;
        summary.totalAborted += (result.abortedCount || 0);
      } catch (err) {
        debugCleanup('Cleanup error for connection %s: %s', name, err.message);
        summary.errors.push({ connection: name, error: err.message });
      }
    }

    summary.finishedAt = new Date().toISOString();
    this._lastRun = summary.finishedAt;
    this._lastStats = summary;
    debugCleanup('Cleanup cycle completed: %d uploads aborted across %d connections', summary.totalAborted, summary.connectionsProcessed);
    return summary;
  }

  start({ intervalHours = 24, olderThanDays = 7, connectionNames = null } = {}) {
    if (this._running) return;
    this._running = true;

    const intervalMs = Math.max(60000, Number(intervalHours) * 3600 * 1000);
    debugCleanup('Starting cleanup scheduler every %s hour(s)', intervalHours);

    // Run first pass asynchronously
    this.runOnce({ olderThanDays, connectionNames }).catch(err => {
      debugCleanup('Initial cleanup run error: %s', err.message);
    });

    this._timer = setInterval(() => {
      this.runOnce({ olderThanDays, connectionNames }).catch(err => {
        debugCleanup('Scheduled cleanup run error: %s', err.message);
      });
    }, intervalMs);

    if (this._timer.unref) {
      this._timer.unref();
    }
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._running = false;
    debugCleanup('Cleanup scheduler stopped');
  }

  getStatus() {
    return {
      running: this._running,
      lastRun: this._lastRun,
      lastStats: this._lastStats
    };
  }
}

export const cleanupScheduler = new CleanupScheduler();
