import { logger } from '../utils/logger.js';
import { DatabaseService } from './DatabaseService.js';
import { v4 as uuidv4 } from 'uuid';

export class LeadService {
  constructor() {
    this.leadStatuses = {
      NEW: 'new',
      CONTACTED: 'contacted', 
      QUALIFIED: 'qualified',
      MEETING_SCHEDULED: 'meeting_scheduled',
      PROPOSAL_SENT: 'proposal_sent',
      CLOSED_WON: 'closed_won',
      CLOSED_LOST: 'closed_lost'
    };

    this.contactPreferences = {
      EMAIL: 'email',
      PHONE: 'phone', 
      MEETING: 'meeting',
      LINKEDIN: 'linkedin'
    };
  }

  async captureLead(leadData) {
    try {
      const {
        name,
        email, 
        company,
        role,
        requirements,
        contact_preference = this.contactPreferences.EMAIL,
        timeline,
        budget_range,
        userId,
        source = 'chatbot'
      } = leadData;

      logger.info('Capturing new lead', { email, company, source });

      // Check if lead already exists
      const existingLead = await DatabaseService.query(
        'SELECT id, status FROM leads WHERE email = $1',
        [email]
      );

      let leadId;
      let isNewLead = false;

      if (existingLead.rows.length > 0) {
        // Update existing lead
        leadId = existingLead.rows[0].id;
        
        const updateResult = await DatabaseService.query(
          `UPDATE leads SET 
           name = COALESCE($1, name),
           company = COALESCE($2, company),
           role = COALESCE($3, role),
           requirements = COALESCE($4, requirements),
           contact_preference = COALESCE($5, contact_preference),
           timeline = COALESCE($6, timeline),
           budget_range = COALESCE($7, budget_range),
           updated_at = NOW(),
           metadata = metadata || $8
           WHERE id = $9
           RETURNING *`,
          [
            name,
            company, 
            role,
            requirements,
            contact_preference,
            timeline,
            budget_range,
            JSON.stringify({ 
              last_interaction: new Date().toISOString(),
              interaction_count: (existingLead.rows[0].metadata?.interaction_count || 0) + 1
            }),
            leadId
          ]
        );

        logger.info('Updated existing lead', { leadId, email });
        
      } else {
        // Create new lead
        isNewLead = true;
        const newUserId = userId || `lead_${uuidv4()}`;
        
        const insertResult = await DatabaseService.query(
          `INSERT INTO leads 
           (user_id, name, email, company, role, requirements, contact_preference, timeline, budget_range, source, status, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING *`,
          [
            newUserId,
            name,
            email,
            company,
            role, 
            requirements,
            contact_preference,
            timeline,
            budget_range,
            source,
            this.leadStatuses.NEW,
            JSON.stringify({
              created_via: source,
              first_interaction: new Date().toISOString(),
              interaction_count: 1
            })
          ]
        );

        leadId = insertResult.rows[0].id;
        logger.info('Created new lead', { leadId, email, isNewLead });
      }

      // Generate follow-up recommendations
      const followUpRecommendations = this.generateFollowUpRecommendations(leadData);

      // Schedule automatic follow-up (this could integrate with email service)
      await this.scheduleFollowUp(leadId, leadData);

      return {
        success: true,
        lead_id: leadId,
        is_new_lead: isNewLead,
        message: isNewLead 
          ? 'Thank you! I\'ve captured your information and will follow up within 24 hours.'
          : 'Thank you! I\'ve updated your information.',
        follow_up_recommendations: followUpRecommendations,
        next_steps: this.getNextSteps(leadData),
        contact_info: {
          email: process.env.BUSINESS_EMAIL || 'hello@devstudio.com',
          response_time: '4-6 hours during business days'
        }
      };

    } catch (error) {
      logger.error('Error capturing lead:', error);
      return {
        success: false,
        error: 'Unable to capture lead information',
        message: 'Please try again or contact me directly at ' + (process.env.BUSINESS_EMAIL || 'hello@devstudio.com'),
        fallback_email: process.env.BUSINESS_EMAIL || 'hello@devstudio.com'
      };
    }
  }

  generateFollowUpRecommendations(leadData) {
    const { requirements, timeline, budget_range, contact_preference } = leadData;
    const recommendations = [];

    // Timeline-based recommendations
    if (timeline && typeof timeline === 'string') {
      const timelineLower = timeline.toLowerCase();
      
      if (timelineLower.includes('urgent') || timelineLower.includes('asap')) {
        recommendations.push({
          type: 'immediate_response',
          message: 'High priority - urgent timeline mentioned',
          action: 'Schedule same-day response call'
        });
      } else if (timelineLower.includes('month')) {
        recommendations.push({
          type: 'monthly_follow_up',
          message: 'Set monthly check-in',
          action: 'Add to monthly follow-up sequence'
        });
      }
    }

    // Requirements-based recommendations
    if (requirements && typeof requirements === 'string') {
      const reqLower = requirements.toLowerCase();
      
      if (reqLower.includes('servicenow')) {
        recommendations.push({
          type: 'servicenow_specialist',
          message: 'ServiceNow expertise highlighted',
          action: 'Send ServiceNow portfolio and case studies'
        });
      }
      
      if (reqLower.includes('frontend') || reqLower.includes('ui') || reqLower.includes('ux')) {
        recommendations.push({
          type: 'frontend_specialist', 
          message: 'Frontend/UX expertise needed',
          action: 'Send frontend portfolio examples'
        });
      }
    }

    // Budget-based recommendations
    if (budget_range) {
      recommendations.push({
        type: 'budget_consideration',
        message: 'Budget range provided',
        action: 'Prepare pricing proposal within budget range'
      });
    }

    // Contact preference recommendations
    if (contact_preference === this.contactPreferences.MEETING) {
      recommendations.push({
        type: 'meeting_preference',
        message: 'Prefers meeting contact',
        action: 'Send calendar link for immediate scheduling'
      });
    }

    return recommendations;
  }

  getNextSteps(leadData) {
    const { contact_preference, requirements } = leadData;
    const nextSteps = [];

    // Standard next steps
    nextSteps.push('I\'ll review your requirements and respond within 4-6 hours');
    
    if (contact_preference === this.contactPreferences.MEETING) {
      nextSteps.push('I\'ll send you a calendar link to schedule a discovery call');
    } else {
      nextSteps.push('I\'ll send you relevant portfolio examples via email');
    }

    nextSteps.push('We can discuss your project timeline and provide a detailed proposal');

    return nextSteps;
  }

  async scheduleFollowUp(leadId, leadData) {
    try {
      // This could integrate with email automation service
      // For now, we'll log the follow-up requirement
      
      const followUpTime = new Date();
      followUpTime.setHours(followUpTime.getHours() + 4); // Follow up in 4 hours

      logger.info('Follow-up scheduled', {
        leadId,
        scheduledFor: followUpTime.toISOString(),
        email: leadData.email,
        contactPreference: leadData.contact_preference
      });

      // Store follow-up task in database
      await DatabaseService.query(
        `UPDATE leads SET 
         metadata = metadata || $1
         WHERE id = $2`,
        [
          JSON.stringify({
            follow_up_scheduled: followUpTime.toISOString(),
            follow_up_method: leadData.contact_preference,
            follow_up_status: 'pending'
          }),
          leadId
        ]
      );

      return { success: true };

    } catch (error) {
      logger.error('Error scheduling follow-up:', error);
      return { success: false };
    }
  }

  async getLeadById(leadId) {
    try {
      const result = await DatabaseService.query(
        'SELECT * FROM leads WHERE id = $1',
        [leadId]
      );

      if (result.rows.length === 0) {
        return { success: false, error: 'Lead not found' };
      }

      return { success: true, lead: result.rows[0] };

    } catch (error) {
      logger.error('Error getting lead by ID:', error);
      return { success: false, error: 'Database error' };
    }
  }

  async getLeadByEmail(email) {
    try {
      const result = await DatabaseService.query(
        'SELECT * FROM leads WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        return { success: false, error: 'Lead not found' };
      }

      return { success: true, lead: result.rows[0] };

    } catch (error) {
      logger.error('Error getting lead by email:', error);
      return { success: false, error: 'Database error' };
    }
  }

  async updateLeadStatus(leadId, status, notes = null) {
    try {
      const validStatuses = Object.values(this.leadStatuses);
      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status: ${status}`);
      }

      const result = await DatabaseService.query(
        `UPDATE leads SET 
         status = $1,
         updated_at = NOW(),
         metadata = metadata || $2
         WHERE id = $3
         RETURNING *`,
        [
          status,
          JSON.stringify({
            status_updated_at: new Date().toISOString(),
            status_notes: notes
          }),
          leadId
        ]
      );

      if (result.rows.length === 0) {
        throw new Error('Lead not found');
      }

      logger.info('Lead status updated', { leadId, status });
      return { success: true, lead: result.rows[0] };

    } catch (error) {
      logger.error('Error updating lead status:', error);
      throw error;
    }
  }

  async getLeads(filters = {}) {
    try {
      const { status, source, limit = 50, offset = 0, sortBy = 'created_at', sortOrder = 'DESC' } = filters;
      
      let query = 'SELECT * FROM leads WHERE 1=1';
      const params = [];
      let paramCount = 0;

      if (status) {
        paramCount++;
        query += ` AND status = $${paramCount}`;
        params.push(status);
      }

      if (source) {
        paramCount++;
        query += ` AND source = $${paramCount}`;
        params.push(source);
      }

      query += ` ORDER BY ${sortBy} ${sortOrder}`;
      
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(limit);
      
      paramCount++;
      query += ` OFFSET $${paramCount}`;
      params.push(offset);

      const result = await DatabaseService.query(query, params);

      return {
        success: true,
        leads: result.rows,
        count: result.rows.length,
        pagination: {
          limit,
          offset,
          hasMore: result.rows.length === limit
        }
      };

    } catch (error) {
      logger.error('Error getting leads:', error);
      return { success: false, error: 'Database error' };
    }
  }

  async getLeadStats() {
    try {
      const stats = await DatabaseService.query(`
        SELECT 
          COUNT(*) as total_leads,
          COUNT(CASE WHEN status = 'new' THEN 1 END) as new_leads,
          COUNT(CASE WHEN status = 'meeting_scheduled' THEN 1 END) as meetings_scheduled,
          COUNT(CASE WHEN status = 'closed_won' THEN 1 END) as closed_won,
          COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as leads_this_week,
          COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END) as leads_this_month
        FROM leads
      `);

      const sourceStats = await DatabaseService.query(`
        SELECT source, COUNT(*) as count
        FROM leads
        GROUP BY source
        ORDER BY count DESC
      `);

      return {
        success: true,
        stats: stats.rows[0],
        source_breakdown: sourceStats.rows
      };

    } catch (error) {
      logger.error('Error getting lead stats:', error);
      return { success: false, error: 'Database error' };
    }
  }
}