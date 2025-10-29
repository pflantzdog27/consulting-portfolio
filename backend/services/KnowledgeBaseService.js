import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { logger } from '../utils/logger.js';
import { DatabaseService } from './DatabaseService.js';

export class KnowledgeBaseService {
  constructor() {
    this.pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });
    
    this.indexName = process.env.PINECONE_INDEX_NAME || 'servicenow-consultancy';
    this.index = null;
    
    this.openai = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY 
    });
    
    this.embeddingModel = 'text-embedding-3-small';
    this.embeddingDimensions = 1536;
  }

  async initialize() {
    try {
      // Get or create the index
      this.index = this.pinecone.index(this.indexName);
      logger.info('Pinecone index initialized', { indexName: this.indexName });
    } catch (error) {
      logger.error('Failed to initialize Pinecone index:', error);
      throw error;
    }
  }

  async search(query, category = null, topK = 5) {
    try {
      if (!this.index) {
        await this.initialize();
      }

      // Generate embedding for the query
      const embedding = await this.generateEmbedding(query);

      // Build filter for category if specified
      const filter = category ? { category: { $eq: category } } : {};

      logger.info('Searching knowledge base', { 
        query: query.substring(0, 100), 
        category, 
        topK 
      });

      // Search in Pinecone
      const searchResults = await this.index.query({
        vector: embedding,
        topK,
        filter,
        includeMetadata: true
      });

      // Format and return results
      const formattedResults = searchResults.matches.map(match => ({
        content: match.metadata?.content || '',
        title: match.metadata?.title || '',
        category: match.metadata?.category || '',
        score: match.score,
        source: match.metadata?.source || 'knowledge_base',
        keywords: match.metadata?.keywords || []
      }));

      return {
        query,
        category,
        results: formattedResults,
        total_found: searchResults.matches.length
      };

    } catch (error) {
      logger.error('Knowledge base search failed:', error);
      
      // Fallback to database search if vector search fails
      return await this.fallbackDatabaseSearch(query, category);
    }
  }

  async fallbackDatabaseSearch(query, category = null) {
    try {
      let sql = `
        SELECT title, content, category, keywords, source
        FROM knowledge_entries 
        WHERE content ILIKE $1
      `;
      const params = [`%${query}%`];

      if (category) {
        sql += ' AND category = $2';
        params.push(category);
      }

      sql += ' ORDER BY created_at DESC LIMIT 5';

      const result = await DatabaseService.query(sql, params);

      return {
        query,
        category,
        results: result.rows.map(row => ({
          content: row.content,
          title: row.title,
          category: row.category,
          score: 0.8, // Default score for database search
          source: row.source || 'database',
          keywords: row.keywords || []
        })),
        total_found: result.rows.length,
        fallback: true
      };

    } catch (error) {
      logger.error('Fallback database search failed:', error);
      return {
        query,
        results: [],
        error: 'Unable to search knowledge base',
        fallback: true
      };
    }
  }

  async generateEmbedding(text) {
    try {
      const response = await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: text.substring(0, 8000), // Limit input length
        dimensions: this.embeddingDimensions
      });

      return response.data[0].embedding;
    } catch (error) {
      logger.error('Failed to generate embedding:', error);
      throw error;
    }
  }

  async storeContent(contentObj) {
    try {
      if (!this.index) {
        await this.initialize();
      }

      const { id, title, content, category, keywords, source } = contentObj;

      // Generate embedding
      const embedding = await this.generateEmbedding(content);

      // Store in Pinecone
      await this.index.upsert([{
        id: id,
        values: embedding,
        metadata: {
          title: title || '',
          content: content,
          category: category || 'general',
          keywords: keywords || [],
          source: source || 'manual',
          created_at: new Date().toISOString()
        }
      }]);

      // Also store in PostgreSQL as backup
      await DatabaseService.query(
        `INSERT INTO knowledge_entries (entry_id, title, content, category, keywords, source, vector_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (entry_id) DO UPDATE SET
         title = EXCLUDED.title,
         content = EXCLUDED.content,
         category = EXCLUDED.category,
         keywords = EXCLUDED.keywords,
         source = EXCLUDED.source,
         updated_at = NOW()`,
        [id, title, content, category, keywords, source, id]
      );

      logger.info('Content stored successfully', { id, category });
      return { success: true, id };

    } catch (error) {
      logger.error('Failed to store content:', error);
      throw error;
    }
  }

  async populateKnowledgeBase() {
    const businessContent = [
      {
        id: 'experience_fortune100',
        title: 'Fortune 100 Enterprise Experience',
        content: 'Deep experience delivering enterprise ServiceNow transformations for Fortune 100 organizations. I bring a rare blend of UX leadership and practical delivery. I streamline complexity, accelerate outcomes, and build experiences employees actually adopt. Big-firm skillset, zero big-firm waste — just solutions that move the business forward.',
        category: 'experience',
        keywords: ['fortune 100', 'enterprise', 'transformations', 'ux leadership', 'delivery'],
        source: 'business_profile'
      },
      {
        id: 'service_portal_development',
        title: 'Service Portal Development',
        content: 'Service Portal Development: Create stunning, responsive Service Portals that enhance user experience and streamline business processes with modern design principles. Includes custom widgets, advanced workflows, and seamless integration with backend systems. Expertise in AngularJS, Bootstrap, CSS, and ServiceNow APIs.',
        category: 'services',
        keywords: ['service portal', 'development', 'responsive', 'widgets', 'angularjs'],
        source: 'services'
      },
      {
        id: 'employee_center_solutions',
        title: 'Employee Center Solutions',
        content: 'Employee Center Solutions: Build intuitive Employee Centers that empower users with self-service capabilities and seamless access to enterprise resources. Focus on user adoption, mobile responsiveness, and integration with HR, IT, and business systems.',
        category: 'services',
        keywords: ['employee center', 'self-service', 'mobile', 'hr integration'],
        source: 'services'
      },
      {
        id: 'custom_application_development',
        title: 'Custom Application Development',
        content: 'Custom Application Development: Develop tailored ServiceNow applications that align with your unique business requirements and drive operational efficiency. Includes scoped applications, custom tables, business rules, workflows, and integrations.',
        category: 'services',
        keywords: ['custom applications', 'scoped apps', 'business rules', 'workflows'],
        source: 'services'
      },
      {
        id: 'virtual_agent_implementation',
        title: 'Virtual Agent Implementation',
        content: 'Virtual Agent Implementation: Implement intelligent Virtual Agents that provide 24/7 support and automate routine tasks for improved customer satisfaction. Includes conversational design, NLU training, and integration with knowledge bases.',
        category: 'services',
        keywords: ['virtual agent', 'chatbot', 'automation', '24/7 support', 'nlu'],
        source: 'services'
      },
      {
        id: 'enterprise_service_portal_case_study',
        title: 'Enterprise Service Portal Case Study',
        content: 'Enterprise Service Portal for Fortune 500 company - Modern, responsive portal with advanced workflows and custom widgets. Reduced ticket volume by 40% and improved user satisfaction scores by 60%. Technologies used: ServiceNow, AngularJS, Bootstrap, REST APIs.',
        category: 'projects',
        keywords: ['case study', 'portal', 'fortune 500', 'ticket reduction', 'user satisfaction'],
        source: 'portfolio'
      },
      {
        id: 'mobile_employee_center_case_study',
        title: 'Mobile Employee Center Case Study',
        content: 'Mobile Employee Center PWA optimized for mobile devices. Provided employees with easy access to HR services, IT support, and company resources. 95% mobile adoption rate with 4.8/5 user rating. Technologies: React, PWA, Responsive Design.',
        category: 'projects',
        keywords: ['mobile', 'pwa', 'employee center', 'hr services', 'adoption'],
        source: 'portfolio'
      },
      {
        id: 'workflow_automation_case_study',
        title: 'Workflow Automation Case Study',
        content: 'Advanced workflow automation solution using Flow Designer to streamline business processes and reduce manual tasks by 80%. Implemented complex approval workflows, automated notifications, and integration with external systems.',
        category: 'projects',
        keywords: ['workflow automation', 'flow designer', 'manual tasks', 'approvals'],
        source: 'portfolio'
      },
      {
        id: 'servicenow_technologies',
        title: 'ServiceNow Platform Technologies',
        content: 'ServiceNow Platform expertise includes: Service Portal development with AngularJS and Jelly, Employee Center and Mobile apps, Flow Designer for workflow automation, Integration Hub for external connections, Performance Analytics for reporting, Virtual Agent for chatbots, Custom Applications with scoped development.',
        category: 'technologies',
        keywords: ['servicenow', 'service portal', 'flow designer', 'integration hub', 'performance analytics'],
        source: 'technical_skills'
      },
      {
        id: 'frontend_technologies',
        title: 'Frontend Development Technologies',
        content: 'Frontend technologies expertise: JavaScript (ES6+), React, Angular, Vue.js, HTML5, CSS3, Tailwind CSS, Bootstrap, RESTful APIs, GraphQL, Responsive Design, PWAs, Webpack, npm/yarn, Git version control.',
        category: 'technologies',
        keywords: ['javascript', 'react', 'angular', 'html5', 'css3', 'tailwind', 'responsive'],
        source: 'technical_skills'
      },
      {
        id: 'pricing_servicenow_development',
        title: 'ServiceNow Development Pricing',
        content: 'ServiceNow Development: $150-200/hour. Includes Service Portal development, Employee Center solutions, custom applications, workflow automation, and integrations. Project-based pricing available for larger engagements starting at $15,000.',
        category: 'pricing',
        keywords: ['pricing', 'servicenow development', 'hourly rate', 'project based'],
        source: 'pricing'
      },
      {
        id: 'pricing_frontend_development',
        title: 'Frontend Development Pricing',
        content: 'Frontend Development: $125-175/hour. Modern frontend development using React, Angular, Vue.js and cutting-edge technologies. Includes responsive design, PWA development, API integration, and performance optimization.',
        category: 'pricing',
        keywords: ['pricing', 'frontend development', 'react', 'angular', 'vue'],
        source: 'pricing'
      },
      {
        id: 'pricing_consulting',
        title: 'Strategy & Consulting Pricing',
        content: 'Strategy & Consulting: $200-250/hour. Strategic consulting for ServiceNow implementations, UX/UI strategy, digital transformation, and technical architecture. Retainer and project-based options available.',
        category: 'pricing',
        keywords: ['pricing', 'consulting', 'strategy', 'ux ui', 'digital transformation'],
        source: 'pricing'
      }
    ];

    logger.info('Starting knowledge base population', { totalItems: businessContent.length });

    for (const content of businessContent) {
      try {
        await this.storeContent(content);
        logger.info(`Stored: ${content.id}`);
      } catch (error) {
        logger.error(`Failed to store ${content.id}:`, error);
      }
    }

    logger.info('Knowledge base population completed');
    return { success: true, itemsProcessed: businessContent.length };
  }

  async deleteContent(id) {
    try {
      if (!this.index) {
        await this.initialize();
      }

      // Delete from Pinecone
      await this.index.deleteOne(id);

      // Delete from PostgreSQL
      await DatabaseService.query(
        'DELETE FROM knowledge_entries WHERE entry_id = $1',
        [id]
      );

      logger.info('Content deleted successfully', { id });
      return { success: true };

    } catch (error) {
      logger.error('Failed to delete content:', error);
      throw error;
    }
  }

  async getStats() {
    try {
      // Get stats from PostgreSQL
      const result = await DatabaseService.query(`
        SELECT 
          category,
          COUNT(*) as count
        FROM knowledge_entries 
        GROUP BY category
        ORDER BY count DESC
      `);

      const totalEntries = await DatabaseService.query(
        'SELECT COUNT(*) as total FROM knowledge_entries'
      );

      return {
        total_entries: parseInt(totalEntries.rows[0].total),
        categories: result.rows,
        last_updated: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Failed to get knowledge base stats:', error);
      return {
        total_entries: 0,
        categories: [],
        error: 'Unable to retrieve stats'
      };
    }
  }
}