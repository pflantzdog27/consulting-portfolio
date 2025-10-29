#!/usr/bin/env node

import dotenv from 'dotenv';
import { DatabaseService } from '../services/DatabaseService.js';
import { logger } from '../utils/logger.js';

// Load environment variables
dotenv.config();

async function setupDatabase() {
  try {
    console.log('🚀 Starting database setup...');
    
    // Initialize database connection and create tables
    await DatabaseService.initialize();
    
    console.log('✅ Database setup completed successfully!');
    console.log('\nDatabase structure created:');
    console.log('  📋 leads - Customer lead information');
    console.log('  💬 conversations - Chat conversation tracking');
    console.log('  📝 messages - Individual chat messages');
    console.log('  📅 meetings - Scheduled meetings');
    console.log('  💰 pricing - Service pricing information');
    console.log('  📚 knowledge_entries - Knowledge base backup');
    
    console.log('\nDefault pricing data inserted for:');
    console.log('  🔧 ServiceNow Development ($150-200/hour)');
    console.log('  🎨 Frontend Development ($125-175/hour)');
    console.log('  📊 Strategy & Consulting ($200-250/hour)');
    console.log('  📦 Project-Based Engagements (Custom pricing)');
    
    // Test database connection
    const testResult = await DatabaseService.query('SELECT COUNT(*) as count FROM pricing');
    console.log(`\n✅ Database test successful - ${testResult.rows[0].count} pricing records found`);
    
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    
    if (error.message.includes('connection')) {
      console.error('\n💡 Connection troubleshooting:');
      console.error('  1. Check your DATABASE_URL environment variable');
      console.error('  2. Ensure PostgreSQL is running');
      console.error('  3. Verify database credentials');
      console.error('  4. Check network connectivity');
    }
    
    process.exit(1);
  } finally {
    await DatabaseService.close();
  }
}

async function checkEnvironment() {
  console.log('🔍 Checking environment configuration...');
  
  const requiredVars = [
    'DATABASE_URL',
    'REDIS_URL',
    'ANTHROPIC_API_KEY'
  ];
  
  const optionalVars = [
    'PINECONE_API_KEY',
    'OPENAI_API_KEY',
    'GOOGLE_CLIENT_EMAIL',
    'GOOGLE_PRIVATE_KEY'
  ];
  
  const missing = [];
  const optional = [];
  
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    } else {
      console.log(`  ✅ ${varName} - configured`);
    }
  }
  
  for (const varName of optionalVars) {
    if (!process.env[varName]) {
      optional.push(varName);
    } else {
      console.log(`  ✅ ${varName} - configured`);
    }
  }
  
  if (missing.length > 0) {
    console.error('\n❌ Missing required environment variables:');
    missing.forEach(varName => {
      console.error(`  - ${varName}`);
    });
    console.error('\nPlease set these variables in your .env file');
    return false;
  }
  
  if (optional.length > 0) {
    console.warn('\n⚠️  Optional environment variables not set:');
    optional.forEach(varName => {
      console.warn(`  - ${varName}`);
    });
    console.warn('Some features may be limited without these variables');
  }
  
  console.log('\n✅ Environment configuration check completed');
  return true;
}

async function main() {
  console.log('🏗️  ServiceNow Consultancy Backend Setup');
  console.log('=====================================\n');
  
  // Check environment variables
  const envOk = await checkEnvironment();
  if (!envOk) {
    process.exit(1);
  }
  
  console.log('');
  
  // Setup database
  await setupDatabase();
  
  console.log('\n🎉 Setup completed successfully!');
  console.log('\nNext steps:');
  console.log('  1. Run: npm run populate-knowledge');
  console.log('  2. Run: npm run dev (to start development server)');
  console.log('  3. Test the API at: http://localhost:3000/health');
  console.log('  4. View API docs at: http://localhost:3000/health/docs');
}

// Run the setup
main().catch(error => {
  console.error('❌ Setup failed:', error);
  process.exit(1);
});