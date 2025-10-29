import { logger } from '../utils/logger.js';

export const errorHandler = (err, req, res, next) => {
  logger.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: isDevelopment ? err.message : 'Invalid input data',
      ...(isDevelopment && { details: err.details }),
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing authentication token',
    });
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'File Too Large',
      message: 'The uploaded file exceeds the size limit',
    });
  }

  // Rate limiting error
  if (err.status === 429) {
    return res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, please try again later',
    });
  }

  // Database connection errors
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    return res.status(503).json({
      error: 'Service Unavailable',
      message: 'Database connection failed',
    });
  }

  // Anthropic API errors
  if (err.name === 'AnthropicError') {
    return res.status(502).json({
      error: 'AI Service Error',
      message: 'The AI service is temporarily unavailable',
    });
  }

  // Default to 500 server error
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: isDevelopment ? err.message : 'Something went wrong',
    ...(isDevelopment && { stack: err.stack }),
  });
};