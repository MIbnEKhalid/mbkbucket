import rateLimit from "express-rate-limit";
import { renderPage } from "mbkauthe";

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
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: req => req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown',
  handler: (_req, res) => {
    res.status(429).json({ message: 'Too many requests. Please slow down and try again later.' });
  }
});
