import crypto from 'crypto';
export class FacebookConversionApiService {
    constructor() {
        this.FB_API_VERSION = 'v21.0';
        this.BASE_URL = 'https://graph.facebook.com';
    }
    /**
     * Hash a value using SHA256
     */
    hashValue(value) {
        return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
    }
    /**
     * Normalize and hash phone number
     * Remove spaces, dashes, parentheses, and other non-numeric characters except leading +
     */
    normalizeAndHashPhone(phone) {
        // Remove all non-numeric characters except leading +
        let normalized = phone.replace(/[^\d+]/g, '');
        // If it doesn't start with +, ensure it has country code
        // For US numbers, add +1 if not present
        if (!normalized.startsWith('+')) {
            // Assuming US numbers - add +1 prefix
            normalized = '+1' + normalized;
        }
        return this.hashValue(normalized);
    }
    /**
     * Send a Lead event to Facebook Conversion API
     */
    async sendLeadEvent(params) {
        const { pixelId, pixelToken, email, phone, leadId } = params;
        if (!pixelId || !pixelToken) {
            throw new Error('Facebook Pixel ID and Token are required');
        }
        const eventTime = Math.floor(Date.now() / 1000);
        // Convert MongoDB ObjectId string to a numeric value for Facebook
        // We'll use a hash of the leadId to generate a consistent numeric ID
        const numericLeadId = parseInt(crypto.createHash('md5').update(leadId).digest('hex').substring(0, 15), 16);
        const userData = {
            lead_id: numericLeadId,
        };
        // Add email if provided (hashed with SHA256)
        if (email && email.trim() !== '') {
            userData.em = [this.hashValue(email)];
        }
        // Add phone if provided (normalized and hashed with SHA256)
        if (phone && phone.trim() !== '') {
            userData.ph = [this.normalizeAndHashPhone(phone)];
        }
        const payload = {
            data: [
                {
                    action_source: 'system_generated',
                    custom_data: {
                        event_source: 'crm',
                        lead_event_source: 'Your CRM',
                    },
                    event_name: 'Lead',
                    event_time: eventTime,
                    user_data: userData,
                },
            ],
        };
        const url = `${this.BASE_URL}/${this.FB_API_VERSION}/${pixelId}/events?access_token=${pixelToken}`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Facebook Conversion API error: ${response.status} ${response.statusText} - ${errorText}`);
            }
            const result = await response.json();
            console.log('Facebook Conversion API success:', JSON.stringify(result, null, 2));
        }
        catch (error) {
            console.error('Error sending event to Facebook Conversion API:', error.message);
            throw error;
        }
    }
}
export const facebookConversionApiService = new FacebookConversionApiService();
