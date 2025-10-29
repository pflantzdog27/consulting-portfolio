import express from 'express';
import { ClaudeAIService } from '../services/ClaudeAIService.js';
import { ConversationService } from '../services/ConversationService.js';
import { DatabaseService } from '../services/DatabaseService.js';
import { logger } from '../utils/logger.js';
import Joi from 'joi';

const router = express.Router();

// Initialize services
const claudeService = new ClaudeAIService();
const conversationService = new ConversationService();

// Active WebSocket connections
const activeConnections = new Map();

// Validation schemas
const messageSchema = Joi.object({
  message: Joi.string().required().min(1).max(1000),
  userId: Joi.string().optional(),
  conversationId: Joi.string().optional()
});

const userIdSchema = Joi.object({
  userId: Joi.string().required()
});

// WebSocket endpoint for real-time chat
router.ws('/ws/:userId', async (ws, req) => {
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

    // Get conversation history and send initial context
    try {
      const history = await conversationService.getSessionHistory(userId, 5);
      if (history.length > 0) {
        ws.send(JSON.stringify({
          type: 'conversation_history',
          messages: history,
          timestamp: new Date().toISOString()
        }));
      }
    } catch (error) {
      logger.error('Error loading conversation history:', error);
    }

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        // Validate message
        const { error: msgError } = messageSchema.validate({
          message: message.content,
          userId: userId
        });
        
        if (msgError) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format',
            timestamp: new Date().toISOString()
          }));
          return;
        }

        // Update last activity
        const connection = activeConnections.get(userId);
        if (connection) {
          connection.lastActivity = new Date();
        }

        logger.info('WebSocket message received', {
          userId,
          messageLength: message.content.length
        });

        // Process message with Claude
        await processMessage(ws, userId, message.content);

      } catch (error) {
        logger.error('Error processing WebSocket message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Failed to process message',
          timestamp: new Date().toISOString()
        }));
      }
    });

    ws.on('close', (code, reason) => {
      activeConnections.delete(userId);
      logger.info('WebSocket connection closed', { 
        userId, 
        code, 
        reason: reason.toString() 
      });
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
      messageLength: message.length,
      hasConversationId: !!conversationId
    });

    // Get conversation history
    const history = await conversationService.getSessionHistory(userIdFinal, 10);
    const claudeHistory = await conversationService.formatHistoryForClaude(history);

    // Store user message
    await conversationService.storeMessage(userIdFinal, message, 'user', conversationId);

    // Process with Claude
    const response = await claudeService.processMessage(message, claudeHistory, userIdFinal);

    // Store assistant response
    await conversationService.storeMessage(userIdFinal, response.response, 'assistant', conversationId, {
      tools_used: response.toolsUsed || [],
      tool_results: response.toolResults || []
    });

    res.json({
      response: response.response,
      tools_used: response.toolsUsed || [],
      user_id: userIdFinal,
      timestamp: new Date().toISOString(),
      conversation_id: conversationId
    });

  } catch (error) {
    logger.error('REST chat error:', error);
    res.status(500).json({
      error: 'Chat processing failed',
      message: 'Unable to process your message. Please try again.',
      fallback_email: process.env.BUSINESS_EMAIL || 'hello@devstudio.com'
    });
  }
});

// Get conversation history
router.get('/history/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const limit = parseInt(req.query.limit) || 20;

    const history = await conversationService.getSessionHistory(userId, limit);

    res.json({
      history: history,
      count: history.length,
      user_id: userId
    });

  } catch (error) {
    logger.error('Error getting conversation history:', error);
    res.status(500).json({
      error: 'Failed to retrieve conversation history'
    });
  }
});

// Get active connections status
router.get('/status', async (req, res) => {
  try {
    const activeCount = activeConnections.size;
    const connections = Array.from(activeConnections.entries()).map(([userId, conn]) => ({
      userId,
      connectedAt: conn.connectedAt,
      lastActivity: conn.lastActivity
    }));

    const stats = await conversationService.getConversationStats();

    res.json({
      active_connections: activeCount,
      connections: connections,
      conversation_stats: stats,
      server_time: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error getting chat status:', error);
    res.status(500).json({
      error: 'Failed to get status'
    });
  }
});

// Admin endpoint to get all conversations (basic auth recommended)
router.get('/admin/conversations', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const conversations = await DatabaseService.query(`
      SELECT c.*, l.name, l.email, l.company 
      FROM conversations c
      LEFT JOIN leads l ON c.user_id = l.user_id
      ORDER BY c.last_activity DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json({
      conversations: conversations.rows,
      pagination: {
        limit,
        offset,
        hasMore: conversations.rows.length === limit
      }
    });

  } catch (error) {
    logger.error('Error getting admin conversations:', error);
    res.status(500).json({
      error: 'Failed to retrieve conversations'
    });
  }
});

// Helper function to process messages (used by both WebSocket and REST)
async function processMessage(ws, userId, messageContent) {
  try {
    // Send typing indicator
    ws.send(JSON.stringify({
      type: 'typing_start',
      timestamp: new Date().toISOString()
    }));

    // Get conversation history
    const history = await conversationService.getSessionHistory(userId, 10);
    const claudeHistory = await conversationService.formatHistoryForClaude(history);

    // Store user message
    await conversationService.storeMessage(userId, messageContent, 'user');

    // Process with Claude
    const response = await claudeService.processMessage(messageContent, claudeHistory, userId);

    // Store assistant response
    await conversationService.storeMessage(userId, response.response, 'assistant', null, {
      tools_used: response.toolsUsed || [],
      tool_results: response.toolResults || []
    });

    // Send typing end
    ws.send(JSON.stringify({
      type: 'typing_end',
      timestamp: new Date().toISOString()
    }));

    // Send response
    ws.send(JSON.stringify({
      type: 'message',
      content: response.response,
      tools_used: response.toolsUsed || [],
      timestamp: new Date().toISOString()
    }));

    // Send any special tool notifications
    if (response.toolsUsed && response.toolsUsed.length > 0) {
      for (const tool of response.toolsUsed) {
        if (tool.name === 'schedule_meeting') {
          setTimeout(() => {
            ws.send(JSON.stringify({
              type: 'tool_notification',
              tool: 'schedule_meeting',
              message: '✅ Meeting scheduled! You should receive a calendar invitation shortly.',
              timestamp: new Date().toISOString()
            }));
          }, 1000);
        }
        
        if (tool.name === 'capture_lead') {
          setTimeout(() => {
            ws.send(JSON.stringify({
              type: 'tool_notification',
              tool: 'capture_lead',
              message: '📝 Your information has been captured. I\'ll follow up within 4-6 hours.',
              timestamp: new Date().toISOString()
            }));
          }, 1000);
        }
      }
    }

  } catch (error) {
    logger.error('Error in processMessage:', error);
    
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Sorry, I encountered an error processing your message. Please try again or contact me directly at ' + (process.env.BUSINESS_EMAIL || 'hello@devstudio.com'),
      timestamp: new Date().toISOString()
    }));
  }
}

// Cleanup inactive connections periodically
setInterval(() => {
  const now = new Date();
  const timeout = 30 * 60 * 1000; // 30 minutes

  for (const [userId, connection] of activeConnections.entries()) {
    if (now - connection.lastActivity > timeout) {
      logger.info('Closing inactive WebSocket connection', { userId });
      connection.ws.close(1000, 'Connection timeout');
      activeConnections.delete(userId);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

export default router;