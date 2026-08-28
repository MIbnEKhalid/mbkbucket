import rateLimit from "express-rate-limit";

export const generalLimiter = rateLimit({
  windowMs: 2 * 60 * 1000, // 2 minutes
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).render('error.handlebars', { message: 'Too many requests from your IP. Try again later.', code: 429 });
  }
});

export const pviewRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: req => req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown',
  handler: (_req, res) => {
    res.status(429).json({ message: 'Too many requests. Please slow down and try again later.' });
  }
});
