import dotenv from 'dotenv';

// Load environment variables FIRST before any other imports that might use them
const dotenvResult = dotenv.config();
console.log('🔥 DEBUG: dotenv.config() result:', dotenvResult);
console.log('🔥 DEBUG: ANTHROPIC_API_KEY after dotenv:', !!process.env.ANTHROPIC_API_KEY, 'length:', process.env.ANTHROPIC_API_KEY?.length || 0);

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import expressWs from 'express-ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Import services and routes
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import chatRoutes, { activeConnections, messageSchema, userIdSchema, initializeServices, getServices } from './routes/chat.js';
import healthRoutes from './routes/health.js';
import { DatabaseService } from './services/DatabaseService.js';

// Initialize services after environment variables are loaded and imports are complete
console.log('🔥 DEBUG: Initializing services...');
initializeServices();
console.log('🔥 DEBUG: Services initialized successfully');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Enable WebSocket support
expressWs(app);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:8000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(requestLogger);

// Health check endpoint
app.use('/health', healthRoutes);

// API routes
app.use('/api/chat', chatRoutes);

// WebSocket endpoint for real-time chat
app.ws('/api/chat/ws/:userId', async (ws, req) => {
  const userId = req.params.userId;
  
  try {
    // Validate userId
    const { error } = userIdSchema.validate({ userId });
    if (error) {
      ws.close(1008, 'Invalid user ID');
      return;
    }

    // Store connection
    activeConnections.set(userId, {
      ws: ws,
      connectedAt: new Date(),
      lastActivity: new Date()
    });

    logger.info('WebSocket connection established', { userId });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connection_established',
      message: 'Connected to chatbot service',
      userId: userId,
      timestamp: new Date().toISOString()
    }));

    // TEMPORARY: Skip conversation history loading
    // Get conversation history and send initial context
    // try {
    //   const { conversationService } = getServices();
    //   const history = await conversationService.getSessionHistory(userId, 5);
    //   if (history.length > 0) {
    //     ws.send(JSON.stringify({
    //       type: 'conversation_history',
    //       messages: history,
    //       timestamp: new Date().toISOString()
    //     }));
    //   }
    // } catch (error) {
    //   logger.error('Error loading conversation history:', error);
    // }

    ws.on('message', async (data) => {
      try {
        logger.info('🔥 RAW MESSAGE RECEIVED', { userId, rawData: data.toString(), dataType: typeof data });
        
        const message = JSON.parse(data);
        logger.info('🔥 PARSED MESSAGE', { userId, message });
        
        // Validate message
        const { error: msgError } = messageSchema.validate(message);
        if (msgError) {
          logger.error('🔥 VALIDATION ERROR', { userId, error: msgError.details, message });
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format',
            timestamp: new Date().toISOString()
          }));
          return;
        }
        
        logger.info('🔥 MESSAGE VALIDATION PASSED', { userId, message });

        logger.info('Processing message', { userId, messageLength: message.message.length });

        const { claudeService, conversationService } = getServices();
        
        // TEMPORARY: Start with empty history to test basic Claude API
        const history = [];
        
        // Process with Claude AI
        const response = await claudeService.processMessage(message.message, history, userId);

        // TEMPORARY: Skip conversation storage to focus on Claude API issue
        // await conversationService.storeMessage(userId, message.message, 'user');
        // await conversationService.storeMessage(userId, response.content, 'assistant');

        // Send response
        ws.send(JSON.stringify({
          type: 'message',
          content: response.content,
          tools: response.tools || [],
          timestamp: new Date().toISOString()
        }));

        // Update connection activity
        if (activeConnections.has(userId)) {
          activeConnections.get(userId).lastActivity = new Date();
        }

      } catch (error) {
        logger.error('Message processing error:', { userId, error: error.message });
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Failed to process message',
          timestamp: new Date().toISOString()
        }));
      }
    });

    ws.on('close', (code, reason) => {
      logger.info('WebSocket connection closed', { userId, code, reason: reason?.toString() });
      activeConnections.delete(userId);
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error:', { userId, error: error.message });
      activeConnections.delete(userId);
    });

  } catch (error) {
    logger.error('WebSocket connection error:', error);
    ws.close(1011, 'Internal server error');
  }
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, '../')));
  
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, '../index.html'));
  });
}

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: 'The requested endpoint does not exist',
  });
});

// Global error handler
app.use(errorHandler);

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database connection
    await DatabaseService.initialize();
    logger.info('Database connection established');

    // Start the server
    app.listen(PORT, () => {
      logger.info(`🚀 ServiceNow Consultancy Backend running on port ${PORT}`);
      logger.info(`📡 Environment: ${process.env.NODE_ENV}`);
      logger.info(`🌐 Frontend URL: ${process.env.FRONTEND_URL}`);
      
      if (process.env.NODE_ENV === 'development') {
        logger.info(`📋 API Documentation: http://localhost:${PORT}/health`);
        logger.info(`🔧 WebSocket endpoint: ws://localhost:${PORT}/api/chat/ws/:userId`);
      }
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await DatabaseService.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await DatabaseService.close();
  process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

startServer();