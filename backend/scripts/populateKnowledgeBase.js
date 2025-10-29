#!/usr/bin/env node

import dotenv from 'dotenv';
import { DatabaseService } from '../services/DatabaseService.js';
import { KnowledgeBaseService } from '../services/KnowledgeBaseService.js';
import { logger } from '../utils/logger.js';

// Load environment variables
dotenv.config();

async function populateKnowledgeBase() {
  try {
    console.log('🧠 Starting knowledge base population...');
    
    // Initialize database
    await DatabaseService.initialize();
    
    // Initialize knowledge base service
    const knowledgeService = new KnowledgeBaseService();
    await knowledgeService.initialize();
    
    console.log('✅ Services initialized successfully');
    
    // Populate with business content
    console.log('\n📚 Populating knowledge base with business content...');
    const result = await knowledgeService.populateKnowledgeBase();
    
    if (result.success) {
      console.log(`✅ Successfully processed ${result.itemsProcessed} knowledge entries`);
      
      // Get stats
      const stats = await knowledgeService.getStats();
      console.log('\n📊 Knowledge Base Statistics:');
      console.log(`  📋 Total entries: ${stats.total_entries}`);
      console.log('  📂 Categories:');
      
      stats.categories.forEach(category => {
        console.log(`    - ${category.category}: ${category.count} entries`);
      });
      
      // Test search functionality
      console.log('\n🔍 Testing search functionality...');
      const testQueries = [
        'ServiceNow experience',
        'pricing for frontend development', 
        'Fortune 100 projects',
        'Service Portal development'
      ];
      
      for (const query of testQueries) {
        const searchResult = await knowledgeService.search(query, null, 2);
        console.log(`  Query: "${query}" - Found ${searchResult.results.length} results`);
      }
      
      console.log('\n✅ Knowledge base population completed successfully!');
      
    } else {
      throw new Error('Knowledge base population failed');
    }
    
  } catch (error) {
    console.error('❌ Knowledge base population failed:', error.message);
    
    if (error.message.includes('Pinecone')) {
      console.error('\n💡 Pinecone troubleshooting:');
      console.error('  1. Check your PINECONE_API_KEY environment variable');
      console.error('  2. Verify your Pinecone index name in PINECONE_INDEX_NAME');
      console.error('  3. Ensure the index exists in your Pinecone dashboard');
      console.error('  4. Check Pinecone service status');
    }
    
    if (error.message.includes('OpenAI')) {
      console.error('\n💡 OpenAI troubleshooting:');
      console.error('  1. Check your OPENAI_API_KEY environment variable');
      console.error('  2. Verify API key has embedding permissions');
      console.error('  3. Check OpenAI service status');
    }
    
    process.exit(1);
  } finally {
    await DatabaseService.close();
  }
}

async function checkVectorDBConfiguration() {
  console.log('🔍 Checking vector database configuration...');
  
  const requiredVars = [
    'PINECONE_API_KEY',
    'OPENAI_API_KEY'
  ];
  
  const optionalVars = [
    'PINECONE_INDEX_NAME',
    'PINECONE_ENVIRONMENT'
  ];
  
  const missing = [];
  
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    } else {
      console.log(`  ✅ ${varName} - configured`);
    }
  }
  
  for (const varName of optionalVars) {
    if (process.env[varName]) {
      console.log(`  ✅ ${varName} - configured`);
    } else {
      console.log(`  ⚠️  ${varName} - using default`);
    }
  }
  
  if (missing.length > 0) {
    console.error('\n❌ Missing required environment variables for vector database:');
    missing.forEach(varName => {
      console.error(`  - ${varName}`);
    });
    console.error('\nVector database features will be limited without these variables');
    console.error('The system will fall back to PostgreSQL-based search');
    return false;
  }
  
  console.log('\n✅ Vector database configuration check completed');
  return true;
}

async function createPineconeIndex() {
  try {
    console.log('🏗️  Checking Pinecone index...');
    
    const { Pinecone } = await import('@pinecone-database/pinecone');
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });
    
    const indexName = process.env.PINECONE_INDEX_NAME || 'servicenow-consultancy';
    
    // Check if index exists
    const existingIndexes = await pinecone.listIndexes();
    const indexExists = existingIndexes.indexes?.some(index => index.name === indexName);
    
    if (indexExists) {
      console.log(`  ✅ Index "${indexName}" already exists`);
      return true;
    }
    
    console.log(`  📝 Creating index "${indexName}"...`);
    
    await pinecone.createIndex({
      name: indexName,
      dimension: 1536, // text-embedding-3-small dimension
      metric: 'cosine',
      spec: {
        serverless: {
          cloud: 'aws',
          region: 'us-east-1'
        }
      }
    });
    
    console.log(`  ✅ Index "${indexName}" created successfully`);
    
    // Wait a moment for index to be ready
    console.log('  ⏳ Waiting for index to be ready...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    return true;
    
  } catch (error) {
    console.error('❌ Error with Pinecone index:', error.message);
    return false;
  }
}

async function main() {
  console.log('🧠 ServiceNow Consultancy Knowledge Base Setup');
  console.log('==============================================\n');
  
  // Check configuration
  const configOk = await checkVectorDBConfiguration();
  
  if (configOk) {
    // Try to create/verify Pinecone index
    console.log('');
    const indexOk = await createPineconeIndex();
    
    if (!indexOk) {
      console.log('\n⚠️  Proceeding without vector database - will use PostgreSQL fallback');
    }
  }
  
  console.log('');
  
  // Populate knowledge base
  await populateKnowledgeBase();
  
  console.log('\n🎉 Knowledge base setup completed!');
  console.log('\nThe chatbot now has access to:');
  console.log('  📋 Business experience and background');
  console.log('  🛠️  Service offerings and capabilities');
  console.log('  💼 Portfolio and case studies');
  console.log('  💰 Pricing information');
  console.log('  🔧 Technical expertise details');
  
  console.log('\nNext steps:');
  console.log('  1. Start the server: npm run dev');
  console.log('  2. Test the chatbot at: http://localhost:3000');
  console.log('  3. Try asking: "Tell me about your ServiceNow experience"');
}

// Run the setup
main().catch(error => {
  console.error('❌ Knowledge base setup failed:', error);
  process.exit(1);
});