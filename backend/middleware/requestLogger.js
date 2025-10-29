import { logger } from '../utils/logger.js';

export const requestLogger = (req, res, next) => {
  const start = Date.now();

  // Skip logging for health checks and static files
  if (req.url === '/health' || req.url.startsWith('/favicon')) {
    return next();
  }

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      contentLength: res.get('Content-Length'),
    };

    if (res.statusCode >= 400) {
      logger.warn('Request completed with error', logData);
    } else {
      logger.info('Request completed', logData);
    }
  });

  next();
};