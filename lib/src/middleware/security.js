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

export function pviewSecurity(req, res, next) {
  const ua = req.headers['user-agent'] || '';

  if (!ua || BLOCKED_UA_PATTERNS.test(ua) || !req.headers.accept || SUSPICIOUS_HEADERS.some(h => h in req.headers)) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.removeHeader('Access-Control-Allow-Origin');

  next();
}
