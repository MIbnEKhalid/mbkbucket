import rateLimit from "express-rate-limit";
import { renderPage } from "mbkutils";
import { mbkbucketVar } from "../config/index.js";

export const generalLimiter = rateLimit({
  windowMs: 2 * 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429);
    return renderPage(req, res, 'error.hbs', false, { message: 'Too many requests from your IP. Try again later.', code: 429 });
  }
});

export const pviewRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: () => Number(mbkbucketVar?.pview_rate_limit) || 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => Boolean(req.headers.range) || req.method === 'HEAD' || req.method === 'OPTIONS',
  keyGenerator: req => req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown',
  handler: (_req, res) => {
    res.status(429).json({ message: 'Too many requests. Please slow down and try again later.' });
  }
});
