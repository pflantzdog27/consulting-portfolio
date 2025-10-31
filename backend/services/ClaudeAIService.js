import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';

export class ClaudeAIService {
  constructor() {
    console.log('🔥 DEBUG ClaudeAIService constructor:');
    console.log('🔥 DEBUG - process.env.ANTHROPIC_API_KEY exists:', !!process.env.ANTHROPIC_API_KEY);
    console.log('🔥 DEBUG - process.env.ANTHROPIC_API_KEY length:', process.env.ANTHROPIC_API_KEY?.length || 0);
    console.log('🔥 DEBUG - process.env.ANTHROPIC_API_KEY starts with sk-ant:', process.env.ANTHROPIC_API_KEY?.startsWith('sk-ant') || false);
    
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    
    console.log('🔥 DEBUG - Anthropic instance created successfully');

    this.systemPrompt = `You are a professional AI assistant for a ServiceNow consultancy business specializing in enterprise transformations.

BUSINESS CONTEXT:
- Company: ${process.env.BUSINESS_NAME || 'Pflantzer Consulting'}
- Expert ServiceNow developer and frontend specialist
- Deep experience with Fortune 100 enterprise transformations
- Focus on UX leadership and practical delivery
- Services: Service Portal development, Employee Centers, Custom Applications, Virtual Agents, UX/UI transformations
- Contact: ${process.env.BUSINESS_EMAIL || 'adam@pflantzer.com'}

KEY EXPERTISE:
- ServiceNow Platform: Service Portal, Employee Center, Flow Designer, Integration Hub, Performance Analytics
- Frontend Technologies: JavaScript, React, Angular, HTML5, CSS3, Tailwind CSS
- Enterprise Focus: UX/UI design, Agile methodologies, User adoption strategies

PRICING INFORMATION:
- ServiceNow Development: $150-200/hour
- Frontend Development: $125-175/hour  
- Strategy & Consulting: $200-250/hour
- Project-based work: Custom pricing based on deliverables

PERSONALITY & COMMUNICATION:
- Professional but approachable
- Focus on business value and practical solutions
- Direct and efficient communication
- Emphasize Fortune 100 experience and proven results
- Use business-appropriate language
- Be helpful but not overly enthusiastic

CAPABILITIES:
You can help with:
- Answering questions about experience and services
- Providing pricing information
- Checking availability and scheduling meetings
- Searching the knowledge base for detailed information
- Capturing lead information for follow-up

Always be helpful, professional, and focused on how our expertise can solve the client's business challenges.`;

    this.tools = [
      {
        name: "search_knowledge_base",
        description: "Search the knowledge base for detailed information about services, experience, projects, or technical capabilities",
        input_schema: {
          type: "object",
          properties: {
            query: { 
              type: "string", 
              description: "The search query to find relevant information" 
            },
            category: { 
              type: "string", 
              enum: ["experience", "services", "projects", "pricing", "technologies", "case_studies"],
              description: "Optional category to filter the search"
            }
          },
          required: ["query"]
        }
      },
      {
        name: "check_availability",
        description: "Check calendar availability for scheduling meetings",
        input_schema: {
          type: "object",
          properties: {
            date: { 
              type: "string", 
              description: "Preferred date in YYYY-MM-DD format" 
            },
            meeting_type: { 
              type: "string", 
              enum: ["discovery", "technical", "strategy"],
              description: "Type of meeting: discovery (30min), technical (60min), or strategy (45min)"
            },
            time_preference: {
              type: "string",
              enum: ["morning", "afternoon", "any"],
              description: "Preferred time of day"
            }
          },
          required: ["date", "meeting_type"]
        }
      },
      {
        name: "schedule_meeting",
        description: "Schedule a confirmed meeting with the client",
        input_schema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Client's full name" },
            email: { type: "string", description: "Client's email address" },
            company: { type: "string", description: "Client's company name" },
            date: { type: "string", description: "Meeting date (YYYY-MM-DD)" },
            time: { type: "string", description: "Meeting time (HH:MM in 24-hour format)" },
            meeting_type: { 
              type: "string", 
              enum: ["discovery", "technical", "strategy"],
              description: "Type of meeting"
            },
            requirements: { 
              type: "string", 
              description: "Brief description of client's needs or project requirements" 
            },
            timezone: {
              type: "string",
              description: "Client's timezone (default: America/New_York)"
            }
          },
          required: ["name", "email", "date", "time", "meeting_type", "requirements"]
        }
      },
      {
        name: "get_pricing_info",
        description: "Get detailed pricing information for specific services",
        input_schema: {
          type: "object",
          properties: {
            service_type: { 
              type: "string", 
              enum: ["servicenow_dev", "frontend_dev", "consulting", "project_based"],
              description: "Type of service requested"
            },
            scope: { 
              type: "string", 
              description: "Project scope, complexity, or specific requirements" 
            },
            timeline: {
              type: "string",
              description: "Expected project timeline or urgency"
            }
          },
          required: ["service_type"]
        }
      },
      {
        name: "capture_lead",
        description: "Capture lead information for follow-up when someone expresses interest",
        input_schema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Lead's full name" },
            email: { type: "string", description: "Lead's email address" },
            company: { type: "string", description: "Lead's company name" },
            role: { type: "string", description: "Lead's job title or role" },
            requirements: { 
              type: "string", 
              description: "Description of their needs, challenges, or project requirements" 
            },
            contact_preference: { 
              type: "string", 
              enum: ["email", "phone", "meeting"],
              description: "Preferred method of follow-up contact"
            },
            timeline: {
              type: "string",
              description: "When they're looking to start or make a decision"
            },
            budget_range: {
              type: "string",
              description: "Approximate budget range if mentioned"
            }
          },
          required: ["name", "email", "requirements"]
        }
      }
    ];
  }

  async processMessage(userMessage, conversationHistory = [], userId = null) {
    try {
      // Debug: Log raw conversation history  
      logger.info('🔥 RAW CONVERSATION HISTORY:', conversationHistory);
      
      // Format conversation history to only include role and content (Claude API requirement)
      const formattedHistory = conversationHistory
        .filter(msg => msg && msg.role && msg.content) // Filter out invalid messages
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }))
        .slice(-10); // Keep only last 10 messages for context
      
      logger.info('🔥 FORMATTED CONVERSATION HISTORY:', formattedHistory);
      
      const messages = [
        ...formattedHistory,
        { role: "user", content: userMessage }
      ];

      logger.info('🔥 FINAL MESSAGES TO CLAUDE:', messages);
      logger.info('🔥 FINAL MESSAGES JSON:', JSON.stringify(messages, null, 2));

      logger.info('Processing message with Claude', {
        userId,
        messageLength: userMessage.length,
        historyLength: conversationHistory.length
      });

      // Build the API request parameters
      const apiParams = {
        model: process.env.CLAUDE_MODEL || "claude-3-haiku-20240307",
        max_tokens: 1500,
        system: this.systemPrompt,
        messages: messages,
        tools: this.tools,
        temperature: 0.7
      };

      const response = await this.anthropic.messages.create(apiParams);

      // Handle tool calls if present
      if (response.content.some(block => block.type === 'tool_use')) {
        const toolResults = [];
        
        for (const block of response.content) {
          if (block.type === 'tool_use') {
            logger.info('Executing tool', { 
              toolName: block.name, 
              toolInput: block.input,
              userId 
            });
            
            const result = await this.executeFunction(block.name, block.input, userId);
            toolResults.push({
              tool_use_id: block.id,
              content: JSON.stringify(result)
            });
          }
        }

        // Get final response with tool results
        const finalApiParams = {
          model: process.env.CLAUDE_MODEL || "claude-3-haiku-20240307",
          max_tokens: 1500,
          system: this.systemPrompt,
          messages: [
            ...messages,
            { role: "assistant", content: response.content },
            { role: "user", content: toolResults }
          ],
          temperature: 0.7
        };

        const finalResponse = await this.anthropic.messages.create(finalApiParams);

        return {
          content: finalResponse.content[0].text,
          toolsUsed: response.content.filter(block => block.type === 'tool_use'),
          toolResults: toolResults
        };
      }

      return {
        content: response.content[0].text,
        toolsUsed: []
      };

    } catch (error) {
      logger.error('Claude API Error:', error);
      
      if (error.status === 429) {
        return {
          content: "I'm experiencing high demand right now. Please try again in a moment, or feel free to email me directly at " + (process.env.BUSINESS_EMAIL || 'adam@pflantzer.com'),
          error: true,
          errorType: 'rate_limit'
        };
      }

      if (error.status === 401) {
        return {
          content: "I'm experiencing technical difficulties with my AI service. Please contact me directly at " + (process.env.BUSINESS_EMAIL || 'adam@pflantzer.com'),
          error: true,
          errorType: 'auth_error'
        };
      }

      return {
        content: "I apologize, but I'm experiencing technical difficulties. Please try again or contact me directly at " + (process.env.BUSINESS_EMAIL || 'adam@pflantzer.com'),
        error: true,
        errorType: 'unknown'
      };
    }
  }

  async executeFunction(functionName, args, userId = null) {
    try {
      const { KnowledgeBaseService } = await import('./KnowledgeBaseService.js');
      const { CalendarService } = await import('./CalendarService.js');
      const { PricingService } = await import('./PricingService.js');
      const { LeadService } = await import('./LeadService.js');

      switch (functionName) {
        case 'search_knowledge_base':
          const knowledgeService = new KnowledgeBaseService();
          return await knowledgeService.search(args.query, args.category);
        
        case 'check_availability':
          const calendarService = new CalendarService();
          return await calendarService.checkAvailability(
            args.date, 
            args.meeting_type, 
            args.time_preference
          );
        
        case 'schedule_meeting':
          const calendarServiceSchedule = new CalendarService();
          return await calendarServiceSchedule.scheduleMeeting({
            ...args,
            userId
          });
        
        case 'get_pricing_info':
          const pricingService = new PricingService();
          return await pricingService.getPricing(
            args.service_type, 
            args.scope, 
            args.timeline
          );
        
        case 'capture_lead':
          const leadService = new LeadService();
          return await leadService.captureLead({
            ...args,
            userId,
            source: 'chatbot'
          });
        
        default:
          return { 
            error: 'Unknown function',
            message: 'The requested function is not available'
          };
      }
    } catch (error) {
      logger.error('Function execution error:', {
        functionName,
        args,
        error: error.message,
        userId
      });
      
      return {
        error: 'Function execution failed',
        message: 'Unable to complete the requested action. Please try again or contact support.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      };
    }
  }

  // Method to validate conversation history format
  validateConversationHistory(history) {
    if (!Array.isArray(history)) {
      return [];
    }

    return history.filter(message => 
      message && 
      typeof message === 'object' && 
      ['user', 'assistant'].includes(message.role) &&
      typeof message.content === 'string'
    ).slice(-10); // Keep only last 10 messages for context
  }
}