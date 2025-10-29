import express from 'express';
import { DatabaseService } from '../services/DatabaseService.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Basic health check
router.get('/', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      services: {
        database: 'unknown',
        redis: 'unknown',
        claude_api: 'unknown'
      }
    };

    // Check database connection
    try {
      await DatabaseService.query('SELECT NOW()');
      health.services.database = 'healthy';
    } catch (error) {
      health.services.database = 'unhealthy';
      health.status = 'degraded';
    }

    // Check Redis connection
    try {
      const redis = DatabaseService.getRedis();
      await redis.ping();
      health.services.redis = 'healthy';
    } catch (error) {
      health.services.redis = 'unhealthy';
      health.status = 'degraded';
    }

    // Check Claude API availability (basic check)
    health.services.claude_api = process.env.ANTHROPIC_API_KEY ? 'configured' : 'not_configured';

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);

  } catch (error) {
    logger.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
});

// Detailed system info
router.get('/detailed', async (req, res) => {
  try {
    const systemInfo = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: {
        node: process.version,
        platform: process.platform,
        architecture: process.arch
      },
      environment_variables: {
        port: process.env.PORT || 3000,
        frontend_url: process.env.FRONTEND_URL || 'not_set',
        database_configured: !!process.env.DATABASE_URL,
        redis_configured: !!process.env.REDIS_URL,
        anthropic_configured: !!process.env.ANTHROPIC_API_KEY,
        pinecone_configured: !!process.env.PINECONE_API_KEY,
        google_calendar_configured: !!process.env.GOOGLE_CLIENT_EMAIL,
        openai_configured: !!process.env.OPENAI_API_KEY
      }
    };

    res.json(systemInfo);

  } catch (error) {
    logger.error('Detailed health check error:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Detailed health check failed'
    });
  }
});

// API endpoints documentation
router.get('/docs', (req, res) => {
  const apiDocs = {
    title: 'ServiceNow Consultancy Chatbot API',
    version: '1.0.0',
    description: 'Backend API for AI-powered ServiceNow consultancy chatbot',
    base_url: req.protocol + '://' + req.get('host'),
    endpoints: {
      chat: {
        websocket: {
          url: '/api/chat/ws/:userId',
          description: 'Real-time WebSocket chat connection',
          parameters: {
            userId: 'Unique identifier for the user session'
          },
          message_format: {
            send: {
              content: 'string (required) - The user message',
              type: 'string (optional) - Message type'
            },
            receive: {
              type: 'string - Message type (message, error, typing_start, etc.)',
              content: 'string - Response content',
              timestamp: 'string - ISO timestamp'
            }
          }
        },
        rest: {
          method: 'POST',
          url: '/api/chat/message',
          description: 'Send chat message via REST API',
          body: {
            message: 'string (required) - The user message',
            userId: 'string (optional) - User identifier',
            conversationId: 'string (optional) - Conversation identifier'
          },
          response: {
            response: 'string - AI response',
            tools_used: 'array - Tools used by AI',
            user_id: 'string - User identifier',
            timestamp: 'string - ISO timestamp'
          }
        },
        history: {
          method: 'GET',
          url: '/api/chat/history/:userId',
          description: 'Get conversation history for a user',
          parameters: {
            userId: 'User identifier',
            limit: 'Number of messages to retrieve (query parameter)'
          }
        },
        status: {
          method: 'GET',
          url: '/api/chat/status',
          description: 'Get active connections and chat statistics'
        }
      },
      health: {
        basic: {
          method: 'GET',
          url: '/health',
          description: 'Basic health check'
        },
        detailed: {
          method: 'GET',
          url: '/health/detailed',
          description: 'Detailed system information'
        },
        docs: {
          method: 'GET',
          url: '/health/docs',
          description: 'API documentation (this endpoint)'
        }
      }
    },
    chatbot_capabilities: {
      ai_features: [
        'Natural language conversation',
        'ServiceNow expertise knowledge base',
        'Calendar availability checking',
        'Meeting scheduling',
        'Lead capture and management',
        'Pricing information',
        'Function calling with tools'
      ],
      supported_tools: [
        'search_knowledge_base - Search business knowledge',
        'check_availability - Check calendar availability',
        'schedule_meeting - Schedule meetings',
        'get_pricing_info - Get service pricing',
        'capture_lead - Capture lead information'
      ],
      integrations: [
        'Anthropic Claude API - AI conversation',
        'Google Calendar API - Meeting scheduling',
        'Pinecone Vector Database - Knowledge search',
        'PostgreSQL - Data storage',
        'Redis - Session management'
      ]
    },
    authentication: {
      note: 'Currently using session-based user identification. No authentication required for chat endpoints.',
      rate_limiting: 'Rate limiting applied: 100 requests per 15 minutes per IP'
    },
    websocket_events: {
      client_to_server: {
        message: {
          content: 'string - User message content',
          type: 'string - Optional message type'
        }
      },
      server_to_client: {
        connection_established: 'Sent when WebSocket connection is established',
        conversation_history: 'Sent with previous conversation messages',
        typing_start: 'Sent when AI starts processing',
        typing_end: 'Sent when AI finishes processing',
        message: 'AI response message',
        tool_notification: 'Special notifications for tool usage',
        error: 'Error messages'
      }
    }
  };

  res.json(apiDocs);
});

export default router;