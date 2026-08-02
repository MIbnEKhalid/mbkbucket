/**
 * Security middleware for public view (p_view) routes.
 * Blocks bot/scraper User-Agents and sets security headers.
 */

const BLOCKED_UA_PATTERNS = /curl|wget|python-requests|python-urllib|go-http|scrapy|libwww|java\/|bot|crawl|spider|headless|phantom|selenium|puppeteer|playwright|postman|insomnia|httpie/i;

const SUSPICIOUS_HEADERS = [
  'x-devtools-emulate-network-conditions-client-id',
  'x-chromedriver-clientid',
  'x-automated-tool'
];

/**
 * p_view security middleware: blocks bots, sets security headers.
 */
export function pviewSecurity(req, res, next) {
  const ua = req.headers['user-agent'] || '';

  // Block empty or obviously automated UAs
  if (!ua || BLOCKED_UA_PATTERNS.test(ua)) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  // Block suspicious headers that indicate automation
  const hasSuspiciousHeaders = SUSPICIOUS_HEADERS.some(header => header in req.headers);
  if (hasSuspiciousHeaders) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  // Verify Accept header is present (legitimate browsers always send this)
  if (!req.headers['accept']) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  // Set security headers for the public view response
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.removeHeader('Access-Control-Allow-Origin');

  next();
}
