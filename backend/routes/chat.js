import express from 'express';
import { ClaudeAIService } from '../services/ClaudeAIService.js';
import { ConversationService } from '../services/ConversationService.js';
import { DatabaseService } from '../services/DatabaseService.js';
import { logger } from '../utils/logger.js';
import Joi from 'joi';

const router = express.Router();

// Services will be initialized later
let claudeService = null;
let conversationService = null;

// Initialize services (called after environment variables are loaded)
export function initializeServices() {
  claudeService = new ClaudeAIService();
  conversationService = new ConversationService();
}

// Get services (ensures they're initialized)
export function getServices() {
  if (!claudeService || !conversationService) {
    throw new Error('Services not initialized. Call initializeServices() first.');
  }
  return { claudeService, conversationService };
}

// Active WebSocket connections
const activeConnections = new Map();

// Validation schemas
const messageSchema = Joi.object({
  message: Joi.string().required().min(1).max(1000),
  userId: Joi.string().optional(),
  conversationId: Joi.string().optional(),
  timestamp: Joi.string().optional()
});

const userIdSchema = Joi.object({
  userId: Joi.string().required()
});

// Export WebSocket handlers for use in server.js
export { activeConnections, messageSchema, userIdSchema };

// REST API endpoint for chat messages (fallback)
router.post('/message', async (req, res) => {
  try {
    const { error } = messageSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message
      });
    }

    const { message, userId, conversationId } = req.body;
    const userIdFinal = userId || `user_${Date.now()}`;

    logger.info('REST message received', {
      userId: userIdFinal,
      messageLength: message.length
    });

    const { claudeService, conversationService } = getServices();
    
    // TEMPORARY: Start with empty history for new users to test basic Claude API
    const history = [];
    
    // Process with Claude AI
    const response = await claudeService.processMessage(message, history, userIdFinal);

    // TEMPORARY: Skip conversation storage to focus on Claude API issue
    // await conversationService.storeMessage(userIdFinal, message, 'user');
    // await conversationService.storeMessage(userIdFinal, response.content, 'assistant');

    res.json({
      success: true,
      response: response.content,
      tools: response.tools || [],
      userId: userIdFinal,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('REST message processing error:', error);
    res.status(500).json({
      error: 'Processing Error',
      message: 'Failed to process message'
    });
  }
});

// Get conversation history for a user
router.get('/history/:userId', async (req, res) => {
  try {
    const { error } = userIdSchema.validate(req.params);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid user ID'
      });
    }

    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    
    const { conversationService } = getServices();
    const history = await conversationService.getSessionHistory(userId, limit);
    
    res.json({
      success: true,
      userId,
      messages: history,
      count: history.length
    });

  } catch (error) {
    logger.error('Error fetching conversation history:', error);
    res.status(500).json({
      error: 'Database Error',
      message: 'Failed to fetch conversation history'
    });
  }
});

// Get active WebSocket connections status
router.get('/status', async (req, res) => {
  try {
    const connections = Array.from(activeConnections.entries()).map(([userId, conn]) => ({
      userId,
      connectedAt: conn.connectedAt,
      lastActivity: conn.lastActivity,
      status: conn.ws.readyState === 1 ? 'connected' : 'disconnected'
    }));

    res.json({
      success: true,
      activeConnections: connections.length,
      connections
    });

  } catch (error) {
    logger.error('Error getting connection status:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Failed to get connection status'
    });
  }
});

export default router;