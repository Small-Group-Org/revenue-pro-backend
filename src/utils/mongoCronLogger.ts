import { Types } from 'mongoose';
import CronLogModel, { ICronLogDocument } from '../services/leads/repository/models/cronLog.model.js';
import logger from './logger.js';

export interface CronJobStartParams {
  jobName: string;
  details: string | object;
  executionId?: string;
  type?: 'manual' | 'cron';
}

export interface CronJobSuccessParams {
  logId: Types.ObjectId;
  details: string | object;
  processedCount?: number;
}

export interface CronJobFailureParams {
  logId: Types.ObjectId;
  error: string;
  details: string | object;
  processedCount?: number;
}

/**
 * MongoDB-based cron job logging utility
 * Replaces file-based logging with persistent database storage
 */
export class MongoCronLogger {
  /**
   * Log the start of a cron job
   * Creates a new log entry with status 'started'
   */
  public static async logCronJobStart(params: CronJobStartParams): Promise<Types.ObjectId> {
    try {
      const executionId = params.executionId || this.generateExecutionId();
      
      const logEntry = new CronLogModel({
        jobName: params.jobName,
        status: 'started',
        type: params.type,
        startedAt: new Date(),
        details: params.details,
        executionId
      });

      const savedLog = await logEntry.save();
      
      logger.info(`Cron job started: ${params.jobName}`, {
        logId: savedLog._id,
        executionId,
        details: params.details
      });

      return savedLog._id as Types.ObjectId;
    } catch (error: any) {
      logger.error('Failed to log cron job start:', error);
      throw error;
    }
  }

  /**
   * Update a cron job log entry with success status
   */
  public static async logCronJobSuccess(params: CronJobSuccessParams): Promise<void> {
    try {
      const updateData: Partial<ICronLogDocument> = {
        status: 'success',
        finishedAt: new Date(),
        details: params.details
      };

      if (params.processedCount !== undefined) {
        updateData.processedCount = params.processedCount;
      }

      await CronLogModel.findByIdAndUpdate(params.logId, updateData);

      logger.info(`Cron job completed successfully`, {
        logId: params.logId,
        processedCount: params.processedCount,
        details: params.details
      });
    } catch (error: any) {
      logger.error('Failed to log cron job success:', error);
      throw error;
    }
  }

  /**
   * Update a cron job log entry with failure status
   */
  public static async logCronJobFailure(params: CronJobFailureParams): Promise<void> {
    try {
      const updateData: Partial<ICronLogDocument> = {
        status: 'failure',
        finishedAt: new Date(),
        error: params.error,
        details: params.details
      };

      if (params.processedCount !== undefined) {
        updateData.processedCount = params.processedCount;
      }

      await CronLogModel.findByIdAndUpdate(params.logId, updateData);

      logger.error(`Cron job failed`, {
        logId: params.logId,
        error: params.error,
        processedCount: params.processedCount,
        details: params.details
      });
    } catch (error: any) {
      logger.error('Failed to log cron job failure:', error);
      throw error;
    }
  }

  /**
   * Get recent cron job logs for a specific job
   */
  public static async getRecentLogs(jobName: string, limit: number = 10): Promise<ICronLogDocument[]> {
    try {
      return await CronLogModel
        .find({ jobName })
        .sort({ startedAt: -1 })
        .limit(limit)
        .exec();
    } catch (error: any) {
      logger.error('Failed to get recent cron logs:', error);
      throw error;
    }
  }

  /**
   * Get all logs for a specific execution ID
   */
  public static async getLogsByExecutionId(executionId: string): Promise<ICronLogDocument[]> {
    try {
      return await CronLogModel
        .find({ executionId })
        .sort({ startedAt: 1 })
        .exec();
    } catch (error: any) {
      logger.error('Failed to get logs by execution ID:', error);
      throw error;
    }
  }

  /**
   * Get cron job statistics
   */
  public static async getCronJobStats(jobName: string, days: number = 30): Promise<{
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    successRate: number;
    averageDuration: number;
    lastRun?: Date;
  }> {
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const logs = await CronLogModel
        .find({ 
          jobName,
          startedAt: { $gte: since }
        })
        .sort({ startedAt: -1 })
        .exec();

      const totalRuns = logs.filter(log => log.status === 'success' || log.status === 'failure').length;
      const successfulRuns = logs.filter(log => log.status === 'success').length;
      const failedRuns = logs.filter(log => log.status === 'failure').length;
      const successRate = totalRuns > 0 ? (successfulRuns / totalRuns) * 100 : 0;

      // Calculate average duration
      const completedLogs = logs.filter(log => log.finishedAt);
      const totalDuration = completedLogs.reduce((sum, log) => {
        return sum + (log.finishedAt!.getTime() - log.startedAt.getTime());
      }, 0);
      const averageDuration = completedLogs.length > 0 ? totalDuration / completedLogs.length : 0;

      const lastRun = logs.length > 0 ? logs[0].startedAt : undefined;

      return {
        totalRuns,
        successfulRuns,
        failedRuns,
        successRate: Math.round(successRate * 100) / 100,
        averageDuration: Math.round(averageDuration),
        lastRun
      };
    } catch (error: any) {
      logger.error('Failed to get cron job stats:', error);
      throw error;
    }
  }

  /**
   * Clean up old logs (keep only last N logs per job)
   */
  public static async cleanupOldLogs(jobName: string, keepCount: number = 100): Promise<number> {
    try {
      const logs = await CronLogModel
        .find({ jobName })
        .sort({ startedAt: -1 })
        .exec();

      if (logs.length <= keepCount) {
        return 0;
      }

      const logsToDelete = logs.slice(keepCount);
      const idsToDelete = logsToDelete.map(log => log._id);

      const result = await CronLogModel.deleteMany({ _id: { $in: idsToDelete } });

      logger.info(`Cleaned up ${result.deletedCount} old cron logs for job: ${jobName}`);
      return result.deletedCount || 0;
    } catch (error: any) {
      logger.error('Failed to cleanup old cron logs:', error);
      throw error;
    }
  }

  /**
   * Update the status of a running cron job to 'processing'
   */
  public static async updateStatusToProcessing(logId: Types.ObjectId): Promise<void> {
    try {
      await CronLogModel.findByIdAndUpdate(logId, { status: 'processing' });
      
      logger.info(`Cron job status updated to processing`, {
        logId
      });
    } catch (error: any) {
      logger.error('Failed to update cron job status:', error);
      throw error;
    }
  }

  /**
   * Generate a unique execution ID
   */
  private static generateExecutionId(): string {
    return new Date().toISOString().replace(/[:.]/g, '-') + '-' + Math.random().toString(36).substr(2, 9);
  }
}

// Convenience function for the main cron job logging
export async function logCronJob(
  jobName: string, 
  status: 'started' | 'processing' | 'success' | 'failure', 
  details: string | object,
  options?: {
    logId?: Types.ObjectId;
    error?: string;
    processedCount?: number;
    executionId?: string;
  }
): Promise<Types.ObjectId | void> {
  try {
    switch (status) {
      case 'started':
        return await MongoCronLogger.logCronJobStart({
          jobName,
          details,
          executionId: options?.executionId
        });

      case 'success':
        if (!options?.logId) {
          throw new Error('logId is required for success status');
        }
        await MongoCronLogger.logCronJobSuccess({
          logId: options.logId,
          details,
          processedCount: options.processedCount
        });
        break;

      case 'failure':
        if (!options?.logId) {
          throw new Error('logId is required for failure status');
        }
        if (!options?.error) {
          throw new Error('error is required for failure status');
        }
        await MongoCronLogger.logCronJobFailure({
          logId: options.logId,
          error: options.error,
          details,
          processedCount: options.processedCount
        });
        break;
    }
  } catch (error: any) {
    logger.error('Failed to log cron job:', error);
    throw error;
  }
}

export default MongoCronLogger;
