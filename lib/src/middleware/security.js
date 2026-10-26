/**
 * Security middleware for public view (p_view) routes.
 * Blocks bot/scraper User-Agents and sets security headers.
 */

import { mbkbucketVar } from "../config/index.js";

const BLOCKED_UA_PATTERNS = /curl|wget|python-requests|python-urllib|go-http|scrapy|libwww|java\/|bot|crawl|spider|headless|phantom|selenium|puppeteer|playwright|postman|insomnia|httpie/i;
const SUSPICIOUS_HEADERS = ['x-devtools-emulate-network-conditions-client-id', 'x-chromedriver-clientid', 'x-automated-tool'];

export function pviewSecurity(req, res, next) {
  const ua = req.headers['user-agent'] || '';

  if (!ua || BLOCKED_UA_PATTERNS.test(ua) || SUSPICIOUS_HEADERS.some(h => h in req.headers)) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  // Handle OPTIONS preflight immediately
  if (req.method === 'OPTIONS') {
    if (mbkbucketVar?.p_view_cors !== false) {
      const allowedOrigin = mbkbucketVar?.p_view_cors_origin || '*';
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range, If-Range, If-None-Match, If-Modified-Since, Accept, Content-Type');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, ETag, Last-Modified, Content-Type');
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    return res.status(204).end();
  }

  // Require Accept header only for standard non-range, non-HEAD requests
  if (!req.headers.accept && !req.headers.range && req.method !== 'HEAD') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Enable CORS for public views so cross-origin web apps and PDF.js can stream files
  if (mbkbucketVar?.p_view_cors !== false) {
    const allowedOrigin = mbkbucketVar?.p_view_cors_origin || '*';
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, If-Range, If-None-Match, If-Modified-Since, Accept, Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, ETag, Last-Modified, Content-Type');
  }

  const frameOpt = mbkbucketVar?.p_view_frame_options || 'SAMEORIGIN';
  if (frameOpt && frameOpt !== 'none' && frameOpt !== 'ALLOWALL') {
    res.setHeader('X-Frame-Options', frameOpt);
  }

  next();
}
