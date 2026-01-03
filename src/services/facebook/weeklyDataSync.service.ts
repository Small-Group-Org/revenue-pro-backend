// weeklyDataSync.service.ts
import UserService from '../user/service/service.js';
import { config } from '../../config.js';
import { DateUtils } from '../../utils/date.utils.js';
import { fbWeeklyAnalyticsRepository } from './repository/FbWeeklyAnalyticsRepository.js';
import { saveWeeklyAnalyticsToDb } from './saveWeeklyAnalytics.service.js';
import { creativesService } from '../creatives/service/CreativesService.js';

export class WeeklyDataSyncService {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  /**
   * Ensure weekly data exists for the given date range
   * This function is optimized to run non-blocking when called from the API
   */
  async ensureWeeklyDataExists(
    clientId: string,
    startDate: string,
    endDate: string,
    waitForSync: boolean = false
  ): Promise<void> {
    try {
      // Check what weeks are missing (fast query)
      const [missingWeeks, currentWeekNeedsUpdate] = await Promise.all([
        this.findMissingWeeks(clientId, startDate, endDate),
        this.isCurrentWeekStale(clientId),
      ]);

      // If nothing to sync, exit early
      if (missingWeeks.length === 0 && !currentWeekNeedsUpdate) {
        return;
      }

      // Get client's ad account info and access token in parallel
      const [clientUser, metaTokenUser] = await Promise.all([
        this.userService.getUserById(clientId),
        this.userService.getUserById(config.META_USER_TOKEN_ID),
      ]);

      if (!clientUser) {
        return;
      }

      const rawAdAccountId = (clientUser as any).fbAdAccountId as string | undefined;
      if (!rawAdAccountId) {
        return;
      }

      const formattedAdAccountId = rawAdAccountId.startsWith('act_')
        ? rawAdAccountId
        : `act_${rawAdAccountId}`;

      const accessToken = (metaTokenUser as any)?.metaAccessToken as string | undefined;
      if (!accessToken) {
        return;
      }

      // Perform the sync
      const syncPromise = this.performSync(
        clientId,
        formattedAdAccountId,
        startDate,
        endDate,
        accessToken,
        missingWeeks.length,
        currentWeekNeedsUpdate
      );

      // If waitForSync is true, await the sync. Otherwise, let it run in background
      if (waitForSync) {
        await syncPromise;
      } else {
        // Fire and forget - silent failure
        syncPromise.catch(() => {});
      }
    } catch (error: any) {
      // Silent failure
    }
  }

  /**
   * Perform the actual sync operation
   */
  private async performSync(
    clientId: string,
    adAccountId: string,
    startDate: string,
    endDate: string,
    accessToken: string,
    missingWeeksCount: number,
    currentWeekNeedsUpdate: boolean
  ): Promise<void> {
    // Step 1: Save weekly analytics data
    await saveWeeklyAnalyticsToDb({
      clientId,
      adAccountId,
      startDate,
      endDate,
      accessToken,
    });

    // Step 2: Auto-fetch creatives for the synced weeks (non-blocking)
    if (config.AUTO_FETCH_CREATIVES) {
      this.fetchCreativesForSyncedWeeks(
        clientId,
        adAccountId,
        startDate,
        endDate,
        accessToken
      ).catch((error) => {
        console.error('[WeeklyDataSync] Failed to auto-fetch creatives:', error.message);
      });
    }
  }

  /**
   * Automatically fetch and save creatives for ads in the synced date range
   * Runs in background without blocking the main sync
   */
  private async fetchCreativesForSyncedWeeks(
    clientId: string,
    adAccountId: string,
    startDate: string,
    endDate: string,
    accessToken: string
  ): Promise<void> {
    try {
      console.log(`[WeeklyDataSync] 🎨 Auto-fetching creatives for ${startDate} to ${endDate}`);
      
      const result = await creativesService.fetchAndSaveCreativesForClient(
        clientId,
        adAccountId,
        accessToken,
        startDate,
        endDate
      );

      console.log(`[WeeklyDataSync] ✅ Creatives auto-fetch complete: ${result.saved} saved, ${result.failed} failed`);
    } catch (error: any) {
      console.error('[WeeklyDataSync] ❌ Error auto-fetching creatives:', error.message);
      // Don't throw - let it fail silently in background
    }
  }

  /**
   * Find which weeks are missing from the database for given date range
   * Optimized with fast database lookup
   */
  private async findMissingWeeks(
    clientId: string,
    startDate: string,
    endDate: string
  ): Promise<Array<{ weekStart: string; weekEnd: string }>> {
    // Generate all expected weeks in the range
    const expectedWeeks = DateUtils.getMonthWeeks(startDate, endDate);

    // Get existing data from database (single query)
    const existingData = await fbWeeklyAnalyticsRepository.getAnalyticsByDateRange(
      clientId,
      startDate,
      endDate
    );

    // Create a set of existing week start dates for O(1) lookup
    const existingWeekStarts = new Set(
      existingData.map((record) => record.weekStartDate)
    );

    // Find missing weeks
    const missingWeeks = expectedWeeks.filter(
      (week) => !existingWeekStarts.has(week.weekStart)
    );

    return missingWeeks;
  }

  /**
   * Check if the current week's data is stale (older than 24 hours)
   * Optimized to minimize database queries
   */
  private async isCurrentWeekStale(clientId: string): Promise<boolean> {
    try {
      // Get current week's start date (Monday of this week)
      const currentWeekStart = this.getCurrentWeekStart();

      // Query for records from current week (single query)
      const currentWeekData = await fbWeeklyAnalyticsRepository.getAnalyticsByDateRange(
        clientId,
        currentWeekStart,
        new Date().toISOString().split('T')[0]
      );

      if (currentWeekData.length === 0) {
        // No data for current week = needs sync
        return true;
      }

      // Check the most recent update time
      const mostRecentUpdate = currentWeekData.reduce((latest, record) => {
        const recordTime = (record as any).savedAt?.getTime() || 0;
        return Math.max(latest, recordTime);
      }, 0);

      // Consider stale if last update was more than 24 hours ago
      const hoursSinceUpdate = (Date.now() - mostRecentUpdate) / (1000 * 60 * 60);
      const isStale = hoursSinceUpdate > 24;

      return isStale;
    } catch (error) {
      return true; // Assume stale on error to trigger sync
    }
  }

  /**
   * Get the start date of the current week (Monday)
   * Pure function - no I/O
   */
  private getCurrentWeekStart(): string {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday, go back 6 days

    const monday = new Date(now);
    monday.setDate(now.getDate() - daysToMonday);

    return monday.toISOString().split('T')[0];
  }
}

// Export singleton instance
export const weeklyDataSyncService = new WeeklyDataSyncService();
