import pg from 'pg';
import Redis from 'ioredis';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

export class DatabaseService {
  static pool = null;
  static redis = null;

  static async initialize() {
    try {
      // Initialize PostgreSQL connection
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      // Test PostgreSQL connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      logger.info('PostgreSQL connection established');

      // Initialize Redis connection
      this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        retryDelayOnFailover: 100,
        enableReadyCheck: false,
        maxRetriesPerRequest: null,
      });

      // Test Redis connection
      await this.redis.ping();
      logger.info('Redis connection established');

      // Create database tables if they don't exist
      await this.createTables();

    } catch (error) {
      logger.error('Database initialization failed:', error);
      throw error;
    }
  }

  static async createTables() {
    const createTablesSQL = `
      -- Users/Leads table
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) UNIQUE,
        name VARCHAR(255),
        email VARCHAR(255),
        company VARCHAR(255),
        role VARCHAR(255),
        phone VARCHAR(50),
        requirements TEXT,
        contact_preference VARCHAR(50) DEFAULT 'email',
        timeline VARCHAR(255),
        budget_range VARCHAR(255),
        source VARCHAR(100) DEFAULT 'chatbot',
        status VARCHAR(50) DEFAULT 'new',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        metadata JSONB DEFAULT '{}'::jsonb
      );

      -- Conversations table
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        lead_id INTEGER REFERENCES leads(id),
        message_count INTEGER DEFAULT 0,
        started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        status VARCHAR(50) DEFAULT 'active',
        metadata JSONB DEFAULT '{}'::jsonb
      );

      -- Messages table
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER REFERENCES conversations(id),
        user_id VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Meetings table
      CREATE TABLE IF NOT EXISTS meetings (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER REFERENCES leads(id),
        user_id VARCHAR(255),
        calendar_event_id VARCHAR(255) UNIQUE,
        meeting_type VARCHAR(50) NOT NULL,
        title VARCHAR(255),
        description TEXT,
        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
        end_time TIMESTAMP WITH TIME ZONE NOT NULL,
        timezone VARCHAR(100) DEFAULT 'America/New_York',
        status VARCHAR(50) DEFAULT 'scheduled',
        meeting_link VARCHAR(500),
        attendee_emails TEXT[],
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        metadata JSONB DEFAULT '{}'::jsonb
      );

      -- Pricing table (reference data)
      CREATE TABLE IF NOT EXISTS pricing (
        id SERIAL PRIMARY KEY,
        service_type VARCHAR(100) NOT NULL,
        service_name VARCHAR(255) NOT NULL,
        hourly_rate_min INTEGER,
        hourly_rate_max INTEGER,
        project_rate_description TEXT,
        description TEXT,
        features TEXT[],
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Knowledge base entries (for database storage backup of vector DB)
      CREATE TABLE IF NOT EXISTS knowledge_entries (
        id SERIAL PRIMARY KEY,
        entry_id VARCHAR(255) UNIQUE NOT NULL,
        title VARCHAR(255),
        content TEXT NOT NULL,
        category VARCHAR(100),
        keywords TEXT[],
        source VARCHAR(255),
        vector_id VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        metadata JSONB DEFAULT '{}'::jsonb
      );

      -- Indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);
      CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
      CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
      CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_last_activity ON conversations(last_activity);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_meetings_lead_id ON meetings(lead_id);
      CREATE INDEX IF NOT EXISTS idx_meetings_start_time ON meetings(start_time);
      CREATE INDEX IF NOT EXISTS idx_knowledge_entries_category ON knowledge_entries(category);

      -- Update trigger for updated_at
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
      END;
      $$ language 'plpgsql';

      CREATE TRIGGER IF NOT EXISTS update_leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER IF NOT EXISTS update_meetings_updated_at BEFORE UPDATE ON meetings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `;

    try {
      await this.pool.query(createTablesSQL);
      logger.info('Database tables created successfully');
      
      // Insert default pricing data
      await this.insertDefaultPricing();
      
    } catch (error) {
      logger.error('Error creating database tables:', error);
      throw error;
    }
  }

  static async insertDefaultPricing() {
    const pricingData = [
      {
        service_type: 'servicenow_dev',
        service_name: 'ServiceNow Development',
        hourly_rate_min: 150,
        hourly_rate_max: 200,
        project_rate_description: 'Custom pricing based on complexity and timeline',
        description: 'Complete ServiceNow platform development including Service Portal, Employee Center, custom applications, and integrations.',
        features: ['Service Portal Development', 'Employee Center Solutions', 'Custom Application Development', 'Workflow Automation', 'Integration Hub', 'Performance Analytics']
      },
      {
        service_type: 'frontend_dev',
        service_name: 'Frontend Development',
        hourly_rate_min: 125,
        hourly_rate_max: 175,
        project_rate_description: 'Project-based pricing available for larger engagements',
        description: 'Modern frontend development using React, Angular, Vue.js and other cutting-edge technologies.',
        features: ['React/Angular/Vue Development', 'Responsive Design', 'PWA Development', 'CSS Frameworks', 'API Integration', 'Performance Optimization']
      },
      {
        service_type: 'consulting',
        service_name: 'Strategy & Consulting',
        hourly_rate_min: 200,
        hourly_rate_max: 250,
        project_rate_description: 'Retainer and project-based options available',
        description: 'Strategic consulting for ServiceNow implementations, UX/UI strategy, and digital transformation.',
        features: ['Platform Strategy', 'UX/UI Consulting', 'Digital Transformation', 'Implementation Planning', 'User Adoption Strategy', 'Technical Architecture']
      },
      {
        service_type: 'project_based',
        service_name: 'Project-Based Engagements',
        hourly_rate_min: null,
        hourly_rate_max: null,
        project_rate_description: 'Fixed-price projects starting at $10,000',
        description: 'Complete project delivery with defined scope, timeline, and deliverables.',
        features: ['Fixed-Price Delivery', 'Defined Scope & Timeline', 'Complete Testing', 'Documentation', 'Training & Support', 'Warranty Period']
      }
    ];

    for (const pricing of pricingData) {
      const checkQuery = 'SELECT id FROM pricing WHERE service_type = $1';
      const result = await this.pool.query(checkQuery, [pricing.service_type]);
      
      if (result.rows.length === 0) {
        const insertQuery = `
          INSERT INTO pricing (service_type, service_name, hourly_rate_min, hourly_rate_max, project_rate_description, description, features)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;
        await this.pool.query(insertQuery, [
          pricing.service_type,
          pricing.service_name,
          pricing.hourly_rate_min,
          pricing.hourly_rate_max,
          pricing.project_rate_description,
          pricing.description,
          pricing.features
        ]);
      }
    }

    logger.info('Default pricing data inserted');
  }

  static async query(text, params = []) {
    const start = Date.now();
    try {
      const res = await this.pool.query(text, params);
      const duration = Date.now() - start;
      
      if (duration > 1000) {
        logger.warn('Slow query detected', {
          query: text.substring(0, 100),
          duration: `${duration}ms`,
          rows: res.rowCount
        });
      }
      
      return res;
    } catch (error) {
      logger.error('Database query error:', {
        query: text.substring(0, 100),
        params,
        error: error.message
      });
      throw error;
    }
  }

  static async getClient() {
    return await this.pool.connect();
  }

  static getRedis() {
    return this.redis;
  }

  static async close() {
    try {
      if (this.pool) {
        await this.pool.end();
        logger.info('PostgreSQL connection closed');
      }
      
      if (this.redis) {
        this.redis.disconnect();
        logger.info('Redis connection closed');
      }
    } catch (error) {
      logger.error('Error closing database connections:', error);
    }
  }
}