import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { logger } from '../utils/logger.js';
import { DatabaseService } from './DatabaseService.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    this.embeddingDimensions = 1024;
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
      const filter = category ? { category: { $eq: category } } : undefined;

      logger.info('Searching knowledge base', { 
        query: query.substring(0, 100), 
        category, 
        topK 
      });

      // Search in Pinecone
      const queryOptions = {
        vector: embedding,
        topK,
        includeMetadata: true
      };
      
      if (filter) {
        queryOptions.filter = filter;
      }
      
      const searchResults = await this.index.query(queryOptions);

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

  async loadMarkdownFiles() {
    try {
      // Path to markdown files (root of project)
      const rootDir = path.resolve(__dirname, '../../');
      const markdownDir = rootDir;

      // File mapping to categories
      const fileCategories = {
        'about-me.md': 'experience',
        'company-history.md': 'experience',
        'mission-values.md': 'experience',
        'service-offerings.md': 'services',
        'technical-expertise.md': 'technologies',
        'case-studies.md': 'projects',
        'faqs.md': 'general',
        'contact-policies.md': 'general'
      };

      const contentItems = [];

      for (const [filename, category] of Object.entries(fileCategories)) {
        try {
          const filePath = path.join(markdownDir, filename);
          const content = await fs.readFile(filePath, 'utf-8');

          // Parse markdown content into sections
          const sections = this.parseMarkdownSections(content, filename);

          sections.forEach((section, index) => {
            contentItems.push({
              id: `${filename.replace('.md', '')}_section_${index}`,
              title: section.title,
              content: section.content,
              category: category,
              keywords: this.extractKeywords(section.content),
              source: filename
            });
          });

          logger.info(`Loaded markdown file: ${filename}`, { sections: sections.length });

        } catch (error) {
          logger.warn(`Could not load ${filename}:`, error.message);
        }
      }

      return contentItems;

    } catch (error) {
      logger.error('Failed to load markdown files:', error);
      return [];
    }
  }

  parseMarkdownSections(content, filename) {
    const sections = [];
    const lines = content.split('\n');
    let currentSection = null;
    let currentContent = [];

    for (const line of lines) {
      // Check for headers (# or ##)
      if (line.match(/^#{1,2}\s+(.+)/)) {
        // Save previous section if exists
        if (currentSection) {
          sections.push({
            title: currentSection,
            content: currentContent.join('\n').trim()
          });
        }

        // Start new section
        currentSection = line.replace(/^#{1,2}\s+/, '').trim();
        currentContent = [];
      } else if (currentSection) {
        currentContent.push(line);
      }
    }

    // Save last section
    if (currentSection && currentContent.length > 0) {
      sections.push({
        title: currentSection,
        content: currentContent.join('\n').trim()
      });
    }

    // If no sections found, use entire content
    if (sections.length === 0) {
      sections.push({
        title: filename.replace('.md', '').replace(/-/g, ' '),
        content: content
      });
    }

    return sections;
  }

  extractKeywords(text) {
    // Simple keyword extraction - remove common words and extract important terms
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those']);

    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !commonWords.has(word));

    // Get unique words and take top 10 most common
    const wordFreq = {};
    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    return Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  async populateKnowledgeBase() {
    // Load content from markdown files
    const markdownContent = await this.loadMarkdownFiles();

    // Use content loaded from markdown files
    const businessContent = markdownContent;

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