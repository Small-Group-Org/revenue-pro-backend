import { google } from 'googleapis';
import { config } from '../../config.js';

export interface FeatureRequestData {
  userName: string;
  userId: string;
  userEmail: string;
  title: string;
  description: string;
}

export class GoogleSheetsService {
  private sheets;
  private auth;
  
  constructor() {
    try {
      // Initialize auth with service account credentials
      this.auth = new google.auth.JWT({
        email: config.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: config.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      
      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
    } catch (error) {
      console.error('Error initializing Google Sheets service:', error);
      throw error;
    }
  }
  
  async appendFeatureRequest(data: FeatureRequestData): Promise<{ success: boolean; message: string }> {
    try {
      const timestamp = new Date().toISOString();
      
      const values = [[
        timestamp,
        data.userName,
        data.userId,
        data.userEmail,
        data.title,
        data.description
      ]];
      
      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId: config.GOOGLE_SHEETS_ID,
        range: 'Sheet1!A:F', // Adjust if your sheet has a different name
        valueInputOption: 'RAW',
        requestBody: {
          values,
        },
      });
      
      console.log('Feature request added to Google Sheets:', response.data);
      
      return {
        success: true,
        message: 'Feature request submitted successfully'
      };
    } catch (error: any) {
      console.error('Error appending to Google Sheets:', error);
      return {
        success: false,
        message: error.message || 'Failed to submit feature request'
      };
    }
  }
}

export const googleSheetsService = new GoogleSheetsService();