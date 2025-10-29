import { logger } from '../utils/logger.js';
import { DatabaseService } from './DatabaseService.js';
import { v4 as uuidv4 } from 'uuid';

export class ConversationService {
  constructor() {
    this.redis = DatabaseService.getRedis();
    this.sessionTimeout = 3600; // 1 hour in seconds
    this.maxMessagesInMemory = 20;
  }

  async createOrGetConversation(userId) {
    try {
      // Check for active conversation in database
      let conversation = await DatabaseService.query(
        'SELECT * FROM conversations WHERE user_id = $1 AND status = $2 ORDER BY last_activity DESC LIMIT 1',
        [userId, 'active']
      );

      if (conversation.rows.length === 0) {
        // Create new conversation
        const newConversation = await DatabaseService.query(
          `INSERT INTO conversations (user_id, started_at, last_activity, status, metadata)
           VALUES ($1, NOW(), NOW(), $2, $3) RETURNING *`,
          [userId, 'active', JSON.stringify({ created_via: 'chatbot' })]
        );
        conversation = newConversation;
      }

      const conversationData = conversation.rows[0];

      // Load recent messages from this conversation
      const messages = await this.getConversationHistory(conversationData.id, 10);

      return {
        conversation: conversationData,
        messages: messages
      };

    } catch (error) {
      logger.error('Error creating/getting conversation:', error);
      throw error;
    }
  }

  async storeMessage(userId, content, role, conversationId = null, metadata = {}) {
    try {
      // Get or create conversation if not provided
      let convId = conversationId;
      if (!convId) {
        const conv = await this.createOrGetConversation(userId);
        convId = conv.conversation.id;
      }

      // Store message in database
      const messageResult = await DatabaseService.query(
        `INSERT INTO messages (conversation_id, user_id, role, content, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
        [convId, userId, role, content, JSON.stringify(metadata)]
      );

      const message = messageResult.rows[0];

      // Update conversation last activity and message count
      await DatabaseService.query(
        `UPDATE conversations SET 
         last_activity = NOW(),
         message_count = message_count + 1
         WHERE id = $1`,
        [convId]
      );

      // Cache recent message in Redis for quick access
      const cacheKey = `conversation:${convId}:recent`;
      await this.redis.lpush(cacheKey, JSON.stringify({
        id: message.id,
        role: message.role,
        content: message.content,
        created_at: message.created_at,
        metadata: message.metadata
      }));
      
      // Keep only recent messages in cache
      await this.redis.ltrim(cacheKey, 0, this.maxMessagesInMemory - 1);
      await this.redis.expire(cacheKey, this.sessionTimeout);

      // Also cache in session-based key for WebSocket access
      const sessionKey = `session:${userId}:messages`;
      await this.redis.lpush(sessionKey, JSON.stringify({
        role: message.role,
        content: message.content,
        timestamp: message.created_at
      }));
      await this.redis.ltrim(sessionKey, 0, this.maxMessagesInMemory - 1);
      await this.redis.expire(sessionKey, this.sessionTimeout);

      logger.info('Message stored successfully', {
        messageId: message.id,
        conversationId: convId,
        userId,
        role
      });

      return message;

    } catch (error) {
      logger.error('Error storing message:', error);
      throw error;
    }
  }

  async getConversationHistory(conversationId, limit = 10) {
    try {
      // First try to get from cache
      const cacheKey = `conversation:${conversationId}:recent`;
      const cachedMessages = await this.redis.lrange(cacheKey, 0, limit - 1);
      
      if (cachedMessages.length > 0) {
        const messages = cachedMessages.map(msg => JSON.parse(msg)).reverse();
        logger.info('Retrieved conversation history from cache', {
          conversationId,
          messageCount: messages.length
        });
        return messages;
      }

      // Fallback to database
      const result = await DatabaseService.query(
        `SELECT id, role, content, created_at, metadata
         FROM messages 
         WHERE conversation_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2`,
        [conversationId, limit]
      );

      const messages = result.rows.reverse(); // Reverse to get chronological order

      logger.info('Retrieved conversation history from database', {
        conversationId,
        messageCount: messages.length
      });

      return messages;

    } catch (error) {
      logger.error('Error getting conversation history:', error);
      return [];
    }
  }

  async getSessionHistory(userId, limit = 10) {
    try {
      // Get from Redis session cache
      const sessionKey = `session:${userId}:messages`;
      const cachedMessages = await this.redis.lrange(sessionKey, 0, limit - 1);
      
      if (cachedMessages.length > 0) {
        const messages = cachedMessages.map(msg => JSON.parse(msg)).reverse();
        return messages;
      }

      // Fallback: get from most recent conversation
      const conversation = await DatabaseService.query(
        'SELECT id FROM conversations WHERE user_id = $1 ORDER BY last_activity DESC LIMIT 1',
        [userId]
      );

      if (conversation.rows.length > 0) {
        return await this.getConversationHistory(conversation.rows[0].id, limit);
      }

      return [];

    } catch (error) {
      logger.error('Error getting session history:', error);
      return [];
    }
  }

  async formatHistoryForClaude(messages) {
    // Convert database messages to Claude API format
    return messages
      .filter(msg => msg.role === 'user' || msg.role === 'assistant')
      .map(msg => ({
        role: msg.role,
        content: msg.content
      }))
      .slice(-10); // Keep only last 10 messages for context
  }

  async updateConversationStatus(conversationId, status) {
    try {
      await DatabaseService.query(
        'UPDATE conversations SET status = $1, updated_at = NOW() WHERE id = $2',
        [status, conversationId]
      );

      logger.info('Conversation status updated', { conversationId, status });

    } catch (error) {
      logger.error('Error updating conversation status:', error);
      throw error;
    }
  }

  async getActiveSessionUsers() {
    try {
      // Get users with recent activity from Redis
      const keys = await this.redis.keys('session:*:messages');
      const activeUsers = keys.map(key => {
        const match = key.match(/session:(.+):messages/);
        return match ? match[1] : null;
      }).filter(Boolean);

      return activeUsers;

    } catch (error) {
      logger.error('Error getting active session users:', error);
      return [];
    }
  }

  async cleanupInactiveSessions() {
    try {
      // Mark conversations as inactive if no activity for more than 24 hours
      await DatabaseService.query(
        `UPDATE conversations SET status = 'inactive' 
         WHERE status = 'active' 
         AND last_activity < NOW() - INTERVAL '24 hours'`
      );

      logger.info('Cleaned up inactive sessions');

    } catch (error) {
      logger.error('Error cleaning up inactive sessions:', error);
    }
  }

  async getConversationStats() {
    try {
      const stats = await DatabaseService.query(`
        SELECT 
          COUNT(*) as total_conversations,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active_conversations,
          AVG(message_count) as avg_messages_per_conversation,
          COUNT(CASE WHEN started_at > NOW() - INTERVAL '24 hours' THEN 1 END) as conversations_today,
          COUNT(CASE WHEN started_at > NOW() - INTERVAL '7 days' THEN 1 END) as conversations_this_week
        FROM conversations
      `);

      const messageStats = await DatabaseService.query(`
        SELECT 
          COUNT(*) as total_messages,
          COUNT(CASE WHEN role = 'user' THEN 1 END) as user_messages,
          COUNT(CASE WHEN role = 'assistant' THEN 1 END) as assistant_messages,
          COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as messages_today
        FROM messages
      `);

      return {
        conversations: stats.rows[0],
        messages: messageStats.rows[0]
      };

    } catch (error) {
      logger.error('Error getting conversation stats:', error);
      return {
        conversations: {},
        messages: {}
      };
    }
  }

  async searchConversations(query, limit = 10) {
    try {
      const result = await DatabaseService.query(`
        SELECT DISTINCT c.*, m.content as sample_message
        FROM conversations c
        JOIN messages m ON c.id = m.conversation_id
        WHERE m.content ILIKE $1
        ORDER BY c.last_activity DESC
        LIMIT $2
      `, [`%${query}%`, limit]);

      return result.rows;

    } catch (error) {
      logger.error('Error searching conversations:', error);
      return [];
    }
  }

  async exportConversation(conversationId) {
    try {
      const conversation = await DatabaseService.query(
        'SELECT * FROM conversations WHERE id = $1',
        [conversationId]
      );

      if (conversation.rows.length === 0) {
        throw new Error('Conversation not found');
      }

      const messages = await DatabaseService.query(
        'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
        [conversationId]
      );

      return {
        conversation: conversation.rows[0],
        messages: messages.rows,
        exported_at: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Error exporting conversation:', error);
      throw error;
    }
  }
}