/**
 * MBKBucket - Metrics & Observability Registry
 * Copyright (c) 2026 Muhammad Bin Khalid, MBKTech.org and contributors
 * Licensed under the MIT License.
 */

export class MetricsRegistry {
  constructor() {
    this.reset();
  }

  reset() {
    this.operations = new Map(); // key: "op:provider:status" -> count
    this.durations = new Map();  // key: "op:provider" -> { totalMs, count, minMs, maxMs }
    this.bytesTransferred = new Map(); // key: "direction:provider" -> bytes
    this.errors = new Map(); // key: "op:provider:errorType" -> count
    this.activeMultipart = 0;
    this.startedAt = new Date().toISOString();
  }

  recordOperation(operation, { provider = 'unknown', status = 'success', durationMs = 0, bytes = 0 } = {}) {
    const opKey = `${operation}:${provider}:${status}`;
    this.operations.set(opKey, (this.operations.get(opKey) || 0) + 1);

    if (durationMs >= 0) {
      const durKey = `${operation}:${provider}`;
      const existing = this.durations.get(durKey) || { totalMs: 0, count: 0, minMs: Infinity, maxMs: 0 };
      existing.totalMs += durationMs;
      existing.count += 1;
      existing.minMs = Math.min(existing.minMs, durationMs);
      existing.maxMs = Math.max(existing.maxMs, durationMs);
      this.durations.set(durKey, existing);
    }

    if (bytes > 0) {
      const direction = operation.startsWith('download') || operation.startsWith('view') ? 'outbound' : 'inbound';
      const byteKey = `${direction}:${provider}`;
      this.bytesTransferred.set(byteKey, (this.bytesTransferred.get(byteKey) || 0) + bytes);
    }
  }

  recordError(operation, provider = 'unknown', errorType = 'Error') {
    const errKey = `${operation}:${provider}:${errorType}`;
    this.errors.set(errKey, (this.errors.get(errKey) || 0) + 1);
  }

  incrementActiveMultipart(delta = 1) {
    this.activeMultipart = Math.max(0, this.activeMultipart + delta);
  }

  getStats() {
    const ops = {};
    for (const [key, count] of this.operations.entries()) {
      ops[key] = count;
    }

    const durations = {};
    for (const [key, d] of this.durations.entries()) {
      durations[key] = {
        count: d.count,
        avgMs: d.count ? Math.round((d.totalMs / d.count) * 100) / 100 : 0,
        minMs: d.minMs === Infinity ? 0 : d.minMs,
        maxMs: d.maxMs
      };
    }

    const bytes = {};
    for (const [key, val] of this.bytesTransferred.entries()) {
      bytes[key] = val;
    }

    const errs = {};
    for (const [key, count] of this.errors.entries()) {
      errs[key] = count;
    }

    return {
      startedAt: this.startedAt,
      activeMultipartUploads: this.activeMultipart,
      operations: ops,
      durations,
      bytesTransferred: bytes,
      errors: errs,
      timestamp: new Date().toISOString()
    };
  }

  toPrometheusText() {
    const lines = [
      '# HELP mbkbucket_operations_total Total number of storage operations executed',
      '# TYPE mbkbucket_operations_total counter'
    ];

    for (const [key, count] of this.operations.entries()) {
      const [operation, provider, status] = key.split(':');
      lines.push(`mbkbucket_operations_total{operation="${operation}",provider="${provider}",status="${status}"} ${count}`);
    }

    lines.push('');
    lines.push('# HELP mbkbucket_operation_duration_seconds Total duration of storage operations');
    lines.push('# TYPE mbkbucket_operation_duration_seconds summary');
    for (const [key, d] of this.durations.entries()) {
      const [operation, provider] = key.split(':');
      lines.push(`mbkbucket_operation_duration_seconds_count{operation="${operation}",provider="${provider}"} ${d.count}`);
      lines.push(`mbkbucket_operation_duration_seconds_sum{operation="${operation}",provider="${provider}"} ${(d.totalMs / 1000).toFixed(4)}`);
    }

    lines.push('');
    lines.push('# HELP mbkbucket_transferred_bytes_total Total bytes transferred into or out of storage');
    lines.push('# TYPE mbkbucket_transferred_bytes_total counter');
    for (const [key, bytes] of this.bytesTransferred.entries()) {
      const [direction, provider] = key.split(':');
      lines.push(`mbkbucket_transferred_bytes_total{direction="${direction}",provider="${provider}"} ${bytes}`);
    }

    lines.push('');
    lines.push('# HELP mbkbucket_errors_total Total storage errors encountered');
    lines.push('# TYPE mbkbucket_errors_total counter');
    for (const [key, count] of this.errors.entries()) {
      const [operation, provider, errorType] = key.split(':');
      lines.push(`mbkbucket_errors_total{operation="${operation}",provider="${provider}",error_type="${errorType}"} ${count}`);
    }

    lines.push('');
    lines.push('# HELP mbkbucket_active_multipart_uploads Current number of active multipart uploads');
    lines.push('# TYPE mbkbucket_active_multipart_uploads gauge');
    lines.push(`mbkbucket_active_multipart_uploads ${this.activeMultipart}`);
    lines.push('');

    return lines.join('\n');
  }
}

export const metricsRegistry = new MetricsRegistry();
