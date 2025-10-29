import { logger } from '../utils/logger.js';
import { DatabaseService } from './DatabaseService.js';

export class PricingService {
  constructor() {
    this.baseRates = {
      servicenow_dev: { min: 150, max: 200 },
      frontend_dev: { min: 125, max: 175 },
      consulting: { min: 200, max: 250 },
      project_based: { min: 10000, max: null }
    };
  }

  async getPricing(serviceType, scope = null, timeline = null) {
    try {
      logger.info('Getting pricing information', { serviceType, scope, timeline });

      // Get detailed pricing from database
      const result = await DatabaseService.query(
        'SELECT * FROM pricing WHERE service_type = $1',
        [serviceType]
      );

      if (result.rows.length === 0) {
        return this.getBasicPricing(serviceType, scope, timeline);
      }

      const pricingData = result.rows[0];
      
      // Calculate estimated range based on scope and timeline
      const estimation = this.calculateEstimation(pricingData, scope, timeline);

      return {
        service_type: serviceType,
        service_name: pricingData.service_name,
        pricing: {
          hourly_rate: pricingData.hourly_rate_min && pricingData.hourly_rate_max 
            ? `$${pricingData.hourly_rate_min}-${pricingData.hourly_rate_max}/hour`
            : null,
          project_rate: pricingData.project_rate_description,
          estimated_range: estimation.range,
          estimated_timeline: estimation.timeline
        },
        description: pricingData.description,
        features: pricingData.features,
        includes: this.getIncludedServices(serviceType),
        next_steps: this.getNextSteps(serviceType),
        contact_info: {
          email: process.env.BUSINESS_EMAIL || 'hello@devstudio.com',
          scheduling: 'Schedule a discovery call to discuss your specific needs'
        }
      };

    } catch (error) {
      logger.error('Error getting pricing information:', error);
      return this.getBasicPricing(serviceType, scope, timeline);
    }
  }

  getBasicPricing(serviceType, scope, timeline) {
    const basicPricing = {
      servicenow_dev: {
        service_name: 'ServiceNow Development',
        hourly_rate: '$150-200/hour',
        project_rate: 'Custom pricing based on complexity',
        description: 'Complete ServiceNow platform development including Service Portal, Employee Center, and custom applications.',
        features: ['Service Portal Development', 'Employee Center Solutions', 'Custom Applications', 'Workflow Automation']
      },
      frontend_dev: {
        service_name: 'Frontend Development',
        hourly_rate: '$125-175/hour',
        project_rate: 'Project-based pricing available',
        description: 'Modern frontend development using React, Angular, and other cutting-edge technologies.',
        features: ['React/Angular Development', 'Responsive Design', 'PWA Development', 'API Integration']
      },
      consulting: {
        service_name: 'Strategy & Consulting',
        hourly_rate: '$200-250/hour',
        project_rate: 'Retainer options available',
        description: 'Strategic consulting for ServiceNow implementations and digital transformation.',
        features: ['Platform Strategy', 'UX/UI Consulting', 'Implementation Planning', 'Technical Architecture']
      },
      project_based: {
        service_name: 'Project-Based Engagements',
        hourly_rate: null,
        project_rate: 'Fixed-price projects starting at $10,000',
        description: 'Complete project delivery with defined scope, timeline, and deliverables.',
        features: ['Fixed-Price Delivery', 'Defined Scope', 'Complete Testing', 'Documentation']
      }
    };

    const pricing = basicPricing[serviceType] || basicPricing.servicenow_dev;

    return {
      service_type: serviceType,
      service_name: pricing.service_name,
      pricing: {
        hourly_rate: pricing.hourly_rate,
        project_rate: pricing.project_rate,
        estimated_range: this.estimateBasicRange(serviceType, scope),
        estimated_timeline: this.estimateTimeline(scope, timeline)
      },
      description: pricing.description,
      features: pricing.features,
      includes: this.getIncludedServices(serviceType),
      next_steps: this.getNextSteps(serviceType),
      contact_info: {
        email: process.env.BUSINESS_EMAIL || 'hello@devstudio.com',
        scheduling: 'Schedule a discovery call to discuss your specific needs'
      }
    };
  }

  calculateEstimation(pricingData, scope, timeline) {
    let multiplier = 1;
    let timelineEstimate = '2-4 weeks';

    // Adjust based on scope
    if (scope && typeof scope === 'string') {
      const scopeLower = scope.toLowerCase();
      
      if (scopeLower.includes('simple') || scopeLower.includes('basic')) {
        multiplier = 0.7;
        timelineEstimate = '1-2 weeks';
      } else if (scopeLower.includes('complex') || scopeLower.includes('enterprise') || scopeLower.includes('large')) {
        multiplier = 1.5;
        timelineEstimate = '6-12 weeks';
      } else if (scopeLower.includes('medium') || scopeLower.includes('moderate')) {
        multiplier = 1;
        timelineEstimate = '3-6 weeks';
      }
    }

    // Adjust based on timeline urgency
    if (timeline && typeof timeline === 'string') {
      const timelineLower = timeline.toLowerCase();
      
      if (timelineLower.includes('urgent') || timelineLower.includes('asap') || timelineLower.includes('rush')) {
        multiplier *= 1.3; // Rush pricing
      }
    }

    let estimatedRange = null;
    if (pricingData.hourly_rate_min && pricingData.hourly_rate_max) {
      const minEstimate = Math.round(pricingData.hourly_rate_min * multiplier * 20); // 20 hours minimum
      const maxEstimate = Math.round(pricingData.hourly_rate_max * multiplier * 80); // 80 hours for complex work
      estimatedRange = `$${minEstimate.toLocaleString()}-${maxEstimate.toLocaleString()}`;
    }

    return {
      range: estimatedRange,
      timeline: timelineEstimate
    };
  }

  estimateBasicRange(serviceType, scope) {
    const rates = this.baseRates[serviceType];
    if (!rates || !rates.min) return null;

    let hours = 40; // Default estimate
    
    if (scope && typeof scope === 'string') {
      const scopeLower = scope.toLowerCase();
      
      if (scopeLower.includes('simple') || scopeLower.includes('basic')) {
        hours = 20;
      } else if (scopeLower.includes('complex') || scopeLower.includes('enterprise')) {
        hours = 100;
      }
    }

    const minEstimate = rates.min * hours;
    const maxEstimate = (rates.max || rates.min * 1.3) * hours;

    return `$${minEstimate.toLocaleString()}-${maxEstimate.toLocaleString()}`;
  }

  estimateTimeline(scope, timeline) {
    if (timeline && typeof timeline === 'string') {
      const timelineLower = timeline.toLowerCase();
      if (timelineLower.includes('urgent') || timelineLower.includes('asap')) {
        return '1-2 weeks (rush delivery)';
      }
    }

    if (scope && typeof scope === 'string') {
      const scopeLower = scope.toLowerCase();
      
      if (scopeLower.includes('simple') || scopeLower.includes('basic')) {
        return '1-3 weeks';
      } else if (scopeLower.includes('complex') || scopeLower.includes('enterprise')) {
        return '8-16 weeks';
      }
    }

    return '3-8 weeks';
  }

  getIncludedServices(serviceType) {
    const included = {
      servicenow_dev: [
        'Initial discovery and requirements gathering',
        'Technical architecture and design',
        'Development and configuration',
        'Testing and quality assurance',
        'Documentation and knowledge transfer',
        'Post-launch support (30 days)'
      ],
      frontend_dev: [
        'UI/UX design consultation',
        'Responsive development',
        'Cross-browser testing',
        'Performance optimization',
        'Code documentation',
        'Deployment assistance'
      ],
      consulting: [
        'Current state assessment',
        'Strategic recommendations',
        'Implementation roadmap',
        'Best practices guidance',
        'Stakeholder workshops',
        'Executive reporting'
      ],
      project_based: [
        'Complete project management',
        'Regular progress updates',
        'Risk mitigation',
        'Change management support',
        'Training and documentation',
        '90-day warranty period'
      ]
    };

    return included[serviceType] || included.servicenow_dev;
  }

  getNextSteps(serviceType) {
    return [
      'Schedule a discovery call to discuss your specific requirements',
      'Receive a detailed proposal with timeline and pricing',
      'Review and approve the project scope',
      'Begin with a kickoff meeting and project planning',
      'Regular check-ins and progress updates throughout development'
    ];
  }

  async getCustomQuote(requirements) {
    try {
      // This could integrate with a more sophisticated pricing model
      // For now, we'll provide guidance on getting a custom quote
      
      logger.info('Custom quote requested', { requirements });

      return {
        message: 'Thank you for your interest in a custom quote.',
        next_steps: [
          'Schedule a discovery call to discuss your requirements in detail',
          'We\'ll analyze your specific needs and provide a tailored proposal',
          'Typical response time for custom quotes is 24-48 hours'
        ],
        contact_info: {
          email: process.env.BUSINESS_EMAIL || 'hello@devstudio.com',
          scheduling_link: 'Use the chatbot to schedule a discovery call',
          phone: process.env.BUSINESS_PHONE || 'Available upon request'
        },
        requirements_submitted: requirements
      };

    } catch (error) {
      logger.error('Error processing custom quote request:', error);
      return {
        error: 'Unable to process quote request',
        message: 'Please contact us directly for a custom quote.',
        contact_info: {
          email: process.env.BUSINESS_EMAIL || 'hello@devstudio.com'
        }
      };
    }
  }

  async updatePricing(serviceType, pricingData) {
    try {
      const result = await DatabaseService.query(
        `UPDATE pricing SET 
         service_name = $1,
         hourly_rate_min = $2,
         hourly_rate_max = $3,
         project_rate_description = $4,
         description = $5,
         features = $6,
         updated_at = NOW()
         WHERE service_type = $7
         RETURNING *`,
        [
          pricingData.service_name,
          pricingData.hourly_rate_min,
          pricingData.hourly_rate_max,
          pricingData.project_rate_description,
          pricingData.description,
          pricingData.features,
          serviceType
        ]
      );

      if (result.rows.length === 0) {
        throw new Error('Service type not found');
      }

      logger.info('Pricing updated successfully', { serviceType });
      return { success: true, data: result.rows[0] };

    } catch (error) {
      logger.error('Error updating pricing:', error);
      throw error;
    }
  }
}