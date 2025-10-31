import { google } from 'googleapis';
import { logger } from '../utils/logger.js';
import { DatabaseService } from './DatabaseService.js';

export class CalendarService {
  constructor() {
    this.calendar = google.calendar('v3');
    this.auth = new google.auth.GoogleAuth({
      credentials: {
        type: 'service_account',
        project_id: process.env.GOOGLE_PROJECT_ID,
        private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        client_id: process.env.GOOGLE_CLIENT_ID,
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs'
      },
      scopes: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events'
      ]
    });

    this.calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
    this.businessTimezone = process.env.BUSINESS_TIMEZONE || 'America/New_York';
    
    // Meeting durations in minutes
    this.meetingDurations = {
      discovery: parseInt(process.env.DISCOVERY_CALL_DURATION) || 30,
      technical: parseInt(process.env.TECHNICAL_DEEP_DIVE_DURATION) || 60,
      strategy: parseInt(process.env.STRATEGY_SESSION_DURATION) || 45
    };
  }

  async checkAvailability(date, meetingType = 'discovery', timePreference = 'any') {
    try {
      const duration = this.meetingDurations[meetingType] || 30;
      const startOfDay = new Date(`${date}T09:00:00.000Z`);
      const endOfDay = new Date(`${date}T17:00:00.000Z`);

      logger.info('Checking calendar availability', {
        date,
        meetingType,
        duration,
        timePreference
      });

      // Get existing events for the day
      const response = await this.calendar.events.list({
        auth: this.auth,
        calendarId: this.calendarId,
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      });

      const busyTimes = response.data.items.map(event => ({
        start: new Date(event.start.dateTime || event.start.date),
        end: new Date(event.end.dateTime || event.end.date)
      }));

      // Find available slots
      const availableSlots = this.findAvailableSlots(
        busyTimes, 
        startOfDay, 
        endOfDay, 
        duration, 
        timePreference
      );

      return {
        success: true,
        date,
        meeting_type: meetingType,
        duration_minutes: duration,
        time_preference: timePreference,
        available_slots: availableSlots,
        timezone: this.businessTimezone
      };

    } catch (error) {
      logger.error('Calendar availability check failed:', error);
      return { 
        success: false,
        error: 'Unable to check calendar availability',
        available_slots: [],
        fallback_message: 'Please email me directly to schedule: ' + (process.env.BUSINESS_EMAIL || 'hello@devstudio.com')
      };
    }
  }

  async scheduleMeeting(meetingData) {
    const { 
      name, 
      email, 
      company, 
      date, 
      time, 
      meeting_type, 
      requirements, 
      userId,
      timezone = this.businessTimezone 
    } = meetingData;
    
    try {
      const duration = this.meetingDurations[meeting_type] || 30;
      const startTime = new Date(`${date}T${time}:00.000Z`);
      const endTime = new Date(startTime.getTime() + (duration * 60 * 1000));

      // Check if slot is still available
      const availability = await this.checkAvailability(date, meeting_type);
      const isSlotAvailable = availability.available_slots.some(slot => 
        slot.start_time === time
      );

      if (!isSlotAvailable) {
        return {
          success: false,
          error: 'The requested time slot is no longer available',
          suggested_action: 'Please check availability again and choose a different time'
        };
      }

      // Prepare meeting details
      const meetingTitles = {
        discovery: 'Discovery Call',
        technical: 'Technical Deep Dive',
        strategy: 'Strategy Session'
      };

      const meetingDescriptions = {
        discovery: 'Initial consultation to discuss your ServiceNow needs and project requirements.',
        technical: 'Technical deep dive to review architecture, requirements, and implementation approach.',
        strategy: 'Strategic planning session to align on goals, timeline, and business outcomes.'
      };

      const event = {
        summary: `${meetingTitles[meeting_type]} - ${name}${company ? ` (${company})` : ''}`,
        description: `${meetingDescriptions[meeting_type]}\n\nClient: ${name}${company ? `\nCompany: ${company}` : ''}\nEmail: ${email}\n\nRequirements:\n${requirements}\n\n---\nScheduled via Pflantzer Consulting AI Assistant`,
        start: {
          dateTime: startTime.toISOString(),
          timeZone: timezone
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: timezone
        },
        attendees: [
          { 
            email: email, 
            displayName: name,
            responseStatus: 'needsAction'
          },
          { 
            email: process.env.BUSINESS_EMAIL || 'hello@devstudio.com',
            responseStatus: 'accepted'
          }
        ],
        conferenceData: {
          createRequest: {
            requestId: `meeting-${Date.now()}-${userId}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 }, // 24 hours
            { method: 'email', minutes: 60 },      // 1 hour
            { method: 'popup', minutes: 15 }       // 15 minutes
          ]
        },
        guestsCanModify: false,
        guestsCanInviteOthers: false,
        guestsCanSeeOtherGuests: false
      };

      // Create the calendar event
      const createdEvent = await this.calendar.events.insert({
        auth: this.auth,
        calendarId: this.calendarId,
        resource: event,
        conferenceDataVersion: 1,
        sendUpdates: 'all'
      });

      // Store meeting in database
      const meetingRecord = await this.storeMeetingInDatabase(meetingData, createdEvent.data);

      logger.info('Meeting scheduled successfully', {
        eventId: createdEvent.data.id,
        attendee: email,
        meetingType: meeting_type,
        startTime: startTime.toISOString()
      });

      return {
        success: true,
        event_id: createdEvent.data.id,
        meeting_link: createdEvent.data.conferenceData?.entryPoints?.[0]?.uri || createdEvent.data.hangoutLink,
        calendar_link: createdEvent.data.htmlLink,
        scheduled_time: startTime.toISOString(),
        duration_minutes: duration,
        timezone: timezone,
        meeting_type: meeting_type,
        attendees: [email, process.env.BUSINESS_EMAIL],
        database_id: meetingRecord.id
      };

    } catch (error) {
      logger.error('Meeting scheduling failed:', error);
      return { 
        success: false, 
        error: 'Unable to schedule meeting',
        fallback_message: 'Please email me directly to schedule: ' + (process.env.BUSINESS_EMAIL || 'hello@devstudio.com'),
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      };
    }
  }

  async storeMeetingInDatabase(meetingData, calendarEvent) {
    const { name, email, company, meeting_type, requirements, userId } = meetingData;

    try {
      // First, find or create lead
      let leadResult = await DatabaseService.query(
        'SELECT id FROM leads WHERE email = $1',
        [email]
      );

      let leadId;
      if (leadResult.rows.length === 0) {
        // Create new lead
        const newLead = await DatabaseService.query(
          `INSERT INTO leads (user_id, name, email, company, requirements, contact_preference, source, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [userId, name, company, email, requirements, 'meeting', 'chatbot_scheduling', 'meeting_scheduled']
        );
        leadId = newLead.rows[0].id;
      } else {
        leadId = leadResult.rows[0].id;
        // Update existing lead
        await DatabaseService.query(
          `UPDATE leads SET name = $1, company = $2, requirements = $3, status = $4, updated_at = NOW()
           WHERE id = $5`,
          [name, company, requirements, 'meeting_scheduled', leadId]
        );
      }

      // Store meeting
      const meetingResult = await DatabaseService.query(
        `INSERT INTO meetings (lead_id, user_id, calendar_event_id, meeting_type, title, description, 
         start_time, end_time, timezone, status, meeting_link, attendee_emails, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [
          leadId,
          userId,
          calendarEvent.id,
          meeting_type,
          calendarEvent.summary,
          calendarEvent.description,
          calendarEvent.start.dateTime,
          calendarEvent.end.dateTime,
          calendarEvent.start.timeZone,
          'scheduled',
          calendarEvent.conferenceData?.entryPoints?.[0]?.uri || calendarEvent.hangoutLink,
          [email, process.env.BUSINESS_EMAIL],
          JSON.stringify({
            original_request: meetingData,
            calendar_event_link: calendarEvent.htmlLink
          })
        ]
      );

      return { id: meetingResult.rows[0].id, leadId };

    } catch (error) {
      logger.error('Error storing meeting in database:', error);
      // Don't fail the whole operation if database storage fails
      return { id: null, leadId: null };
    }
  }

  findAvailableSlots(busyTimes, startOfDay, endOfDay, duration, timePreference = 'any') {
    const slots = [];
    const slotDuration = duration * 60 * 1000; // Convert to milliseconds
    
    // Business hours: 9 AM to 5 PM (adjust as needed)
    let currentTime = new Date(startOfDay);
    const businessEnd = new Date(endOfDay);
    
    // Adjust based on time preference
    if (timePreference === 'morning') {
      businessEnd.setHours(12, 0, 0, 0); // End at noon for morning preference
    } else if (timePreference === 'afternoon') {
      currentTime.setHours(13, 0, 0, 0); // Start at 1 PM for afternoon preference
    }
    
    while (currentTime < businessEnd) {
      const slotEnd = new Date(currentTime.getTime() + slotDuration);
      
      // Check if this slot conflicts with any busy time
      const hasConflict = busyTimes.some(busy => 
        (currentTime < busy.end && slotEnd > busy.start)
      );
      
      if (!hasConflict && slotEnd <= businessEnd) {
        slots.push({
          start_time: currentTime.toTimeString().slice(0, 5), // HH:MM format
          end_time: slotEnd.toTimeString().slice(0, 5),
          datetime: currentTime.toISOString(),
          duration_minutes: duration
        });
      }
      
      // Move to next 30-minute slot
      currentTime = new Date(currentTime.getTime() + (30 * 60 * 1000));
    }
    
    return slots.slice(0, 8); // Return max 8 slots to avoid overwhelming the user
  }

  async cancelMeeting(eventId, reason = 'Cancelled by client') {
    try {
      await this.calendar.events.delete({
        auth: this.auth,
        calendarId: this.calendarId,
        eventId: eventId,
        sendUpdates: 'all'
      });

      // Update database
      await DatabaseService.query(
        'UPDATE meetings SET status = $1, metadata = metadata || $2 WHERE calendar_event_id = $3',
        ['cancelled', JSON.stringify({ cancellation_reason: reason, cancelled_at: new Date().toISOString() }), eventId]
      );

      logger.info('Meeting cancelled successfully', { eventId, reason });
      return { success: true, message: 'Meeting cancelled successfully' };

    } catch (error) {
      logger.error('Failed to cancel meeting:', error);
      return { success: false, error: 'Failed to cancel meeting' };
    }
  }
}