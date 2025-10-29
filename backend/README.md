# ServiceNow Consultancy Backend

Advanced AI-powered chatbot backend for ServiceNow consultancy portfolio website.

## Features

### 🤖 AI-Powered Chatbot
- **Anthropic Claude API** integration with function calling
- **Intelligent conversations** about ServiceNow expertise
- **Real-time responses** via WebSocket and REST API
- **Context-aware** conversations with memory

### 📅 Meeting Scheduling
- **Google Calendar** integration for availability checking
- **Automated scheduling** with calendar invitations
- **Multiple meeting types**: Discovery, Technical, Strategy
- **Email notifications** and reminders

### 🔍 Knowledge Base
- **Vector database** (Pinecone) for semantic search
- **Business expertise** knowledge base
- **Portfolio and case studies** searchable content
- **Pricing information** with intelligent recommendations

### 📊 Lead Management
- **Automated lead capture** from chat interactions
- **PostgreSQL database** for lead storage
- **Follow-up recommendations** and scheduling
- **Conversation history** tracking

### ⚡ Real-time Features
- **WebSocket connections** for instant messaging
- **Typing indicators** and message status
- **Connection management** with automatic reconnection
- **Session persistence** with Redis

## Technology Stack

- **Runtime**: Node.js 18+ with Express.js
- **AI**: Anthropic Claude API with function calling
- **Database**: PostgreSQL + Redis + Pinecone (Vector DB)
- **Calendar**: Google Calendar API
- **Real-time**: WebSocket with express-ws
- **Security**: Helmet, CORS, Rate limiting
- **Monitoring**: Winston logging

## Quick Start

### 1. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit with your API keys and database URLs
nano .env
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Database Setup

```bash
# Create PostgreSQL database and tables
npm run setup-db

# Populate knowledge base (requires Pinecone + OpenAI)
npm run populate-knowledge
```

### 4. Development

```bash
# Start development server with auto-reload
npm run dev

# Or start production server
npm start
```

### 5. Testing

```bash
# Health check
curl http://localhost:3000/health

# API documentation
curl http://localhost:3000/health/docs

# Test chat (REST API)
curl -X POST http://localhost:3000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message": "Tell me about your ServiceNow experience", "userId": "test_user"}'
```

## API Endpoints

### Chat Endpoints
- `WS /api/chat/ws/:userId` - Real-time WebSocket chat
- `POST /api/chat/message` - Send message via REST
- `GET /api/chat/history/:userId` - Get conversation history
- `GET /api/chat/status` - Active connections status

### Health & Monitoring
- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed system info
- `GET /health/docs` - API documentation

## Environment Variables

### Required
```env
ANTHROPIC_API_KEY=your_claude_api_key
DATABASE_URL=postgresql://user:pass@host:5432/db
REDIS_URL=redis://localhost:6379
```

### Optional (Enhanced Features)
```env
PINECONE_API_KEY=your_pinecone_key        # Vector search
OPENAI_API_KEY=your_openai_key            # Embeddings
GOOGLE_CLIENT_EMAIL=service@account.com   # Calendar
GOOGLE_PRIVATE_KEY="-----BEGIN KEY-----" # Calendar
```

### Configuration
```env
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:8000
BUSINESS_EMAIL=hello@devstudio.com
```

## Deployment

### Railway (Recommended)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway link
railway up
```

### Docker
```bash
# Build image
docker build -t consultancy-backend .

# Run container
docker run -p 3000:3000 --env-file .env consultancy-backend
```

### Manual Deployment
1. Set environment variables
2. Run `npm ci --only=production`
3. Run `npm run setup-db`
4. Run `npm run populate-knowledge`
5. Run `npm start`

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Express.js    │    │  Claude API     │
│   (Portfolio)   │◄──►│   Backend       │◄──►│  (Anthropic)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                       │
                                ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Redis Cache   │    │ Knowledge Base  │    │ Google Calendar │
│  (Sessions)     │    │ (Pinecone)      │    │   (Meetings)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   PostgreSQL    │
                       │ (Leads/History) │
                       └─────────────────┘
```

## AI Capabilities

### Function Calling Tools
- **search_knowledge_base** - Search business expertise
- **check_availability** - Check calendar availability  
- **schedule_meeting** - Schedule meetings automatically
- **get_pricing_info** - Provide pricing information
- **capture_lead** - Capture and manage leads

### Conversation Features
- **Context awareness** - Remembers conversation history
- **Tool integration** - Seamlessly uses external APIs
- **Intelligent routing** - Routes complex queries appropriately
- **Fallback handling** - Graceful error handling

## Monitoring & Logs

### Application Logs
- **Winston logging** with file and console output
- **Request logging** with performance metrics
- **Error tracking** with stack traces
- **Tool usage** monitoring

### Health Monitoring
- **Database connectivity** checks
- **External API** status monitoring
- **WebSocket connection** tracking
- **System resource** monitoring

## Security

### API Security
- **Helmet.js** security headers
- **CORS** protection with whitelist
- **Rate limiting** per IP address
- **Input validation** with Joi schemas

### Data Protection
- **Environment variables** for secrets
- **Database encryption** in transit
- **API key** secure storage
- **Session management** with expiration

## Performance

### Optimizations
- **Redis caching** for conversations
- **Connection pooling** for databases
- **WebSocket** for real-time communication
- **Background processing** for heavy tasks

### Scaling
- **Horizontal scaling** ready
- **Load balancer** compatible
- **Database clustering** support
- **Microservices** architecture

## Development

### Scripts
```bash
npm run dev          # Development with auto-reload
npm run setup-db     # Initialize database
npm run populate-knowledge  # Setup knowledge base
npm test            # Run tests
npm run lint        # Code linting
```

### Project Structure
```
backend/
├── services/       # Core business logic
├── routes/        # API route handlers  
├── middleware/    # Express middleware
├── utils/         # Helper functions
├── scripts/       # Setup and utility scripts
├── logs/          # Application logs
└── data/          # Static data files
```

## Troubleshooting

### Common Issues

**Database Connection Failed**
- Check DATABASE_URL format
- Verify PostgreSQL is running
- Test network connectivity

**WebSocket Connection Issues**
- Check CORS configuration
- Verify WebSocket support
- Test REST API fallback

**AI API Errors**
- Validate ANTHROPIC_API_KEY
- Check API rate limits
- Monitor API quotas

**Calendar Integration**
- Verify Google service account
- Check calendar permissions
- Test API credentials

## Support

For issues with this backend:
1. Check the logs in `logs/` directory
2. Verify environment configuration
3. Test individual components
4. Review API documentation at `/health/docs`

## License

MIT License - Built for ServiceNow consultancy portfolio