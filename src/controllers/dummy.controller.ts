import { Request, Response } from 'express';
import logger from '../utils/logger.js';

export const testDummyEndpoint = async (req: Request, res: Response): Promise<void> => {
  const timestamp = new Date().toISOString();
  const message = `Dummy endpoint hit successfully at ${timestamp}`;
  
  logger.info('[Dummy Endpoint] Test endpoint called', { timestamp });
  console.log(`[Dummy Endpoint] ${message}`);
  
  res.status(200).json({
    success: true,
    message,
    timestamp,
  });
};

export const testMultiOpportunitySyncEndpoint = async (req: Request, res: Response): Promise<void> => {
  const timestamp = new Date().toISOString();
  const message = `Multi-opportunity sync dummy endpoint hit successfully at ${timestamp}`;
  
  logger.info('[Multi-Opportunity Sync Dummy] Test endpoint called', { timestamp });
  console.log(`[Multi-Opportunity Sync Dummy] ${message}`);
  
  res.status(200).json({
    success: true,
    message,
    timestamp,
  });
};

