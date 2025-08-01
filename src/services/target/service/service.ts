import { IWeeklyTarget } from "../domain/target.domain.js";
import { IWeeklyTargetDocument } from "../repository/models/target.model.js";
import { TargetRepository } from "../repository/repository.js";
import { DateUtils } from "../../../utils/date.utils.js";

export class TargetService {
  private targetRepository: TargetRepository;

  constructor() {
    this.targetRepository = new TargetRepository();
    // Test the getMonthWeeks function
    DateUtils.testGetMonthWeeks();
  }

  private _aggregateTargets(
    targets: IWeeklyTargetDocument[],
    queryType: string,
    userId?: string,
    startDate?: string,
    endDate?: string
  ): IWeeklyTargetDocument {
    if (targets.length === 0) {
      return {
        userId: userId || "",
        startDate: startDate || new Date().toISOString(),
        endDate: endDate || new Date().toISOString(),
        appointmentRate: 0,
        avgJobSize: 0,
        closeRate: 0,
        com: 0,
        revenue: 0,
        showRate: 0,
        queryType: queryType,
        year: new Date().getFullYear(),
        weekNumber: 0,
      } as unknown as IWeeklyTargetDocument;
    }

    // Use the passed dates if available, otherwise calculate from first target
    let finalStartDate: string;
    let finalEndDate: string;
    let year: number;
    
    if (startDate && endDate) {
      // Use the passed dates (this is what we want for monthly aggregation)
      finalStartDate = startDate;
      finalEndDate = endDate;
      year = new Date(startDate).getFullYear();
    } else {
      // Fallback to calculating from first target (for backward compatibility)
      const firstTarget = targets[0];
      const firstDate = new Date(firstTarget.startDate);
      year = firstDate.getFullYear();
      const month = firstDate.getMonth();
      
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0);
      
      finalStartDate = monthStart.toISOString().split('T')[0];
      finalEndDate = monthEnd.toISOString().split('T')[0];
    }
    
    const aggregated: IWeeklyTarget = {
      userId: targets[0].userId,
      startDate: finalStartDate,
      endDate: finalEndDate,
      year: year,
      weekNumber: targets[0].weekNumber,
      appointmentRate: 0,
      avgJobSize: 0,
      closeRate: 0,
      com: 0,
      revenue: 0,
      showRate: 0,
      queryType: targets[0].queryType || "",
    };

    // Sum up revenue from all weekly targets
    for (const target of targets) {
      aggregated.revenue += target.revenue || 0;
    }
    
    // Use values from the first target for other fields (they should be the same across weeks)
    aggregated.avgJobSize = targets[0].avgJobSize || 0;
    aggregated.appointmentRate = targets[0].appointmentRate || 0;
    aggregated.showRate = targets[0].showRate || 0;
    aggregated.closeRate = targets[0].closeRate || 0;
    aggregated.com = targets[0].com || 0;

    return aggregated as IWeeklyTargetDocument;
  }

  public async upsertWeeklyTarget(
    userId: string,
    startDate: string,
    endDate: string,
    data: Partial<IWeeklyTarget>,
    queryType: string
  ): Promise<IWeeklyTargetDocument> {
    try {
      console.log(`=== Creating/Updating Weekly Target ===`);
      console.log(`userId: ${userId}`);
      console.log(`startDate: ${startDate}`);
      console.log(`endDate: ${endDate}`);
      console.log(`queryType: ${queryType}`);
      console.log(`data:`, data);
      
      const weekData = DateUtils.getWeekDetails(startDate);
      console.log(`Week data:`, weekData);
      
      const defaultTarget: IWeeklyTarget = {
        userId,
        startDate: weekData.weekStart,
        endDate: weekData.weekEnd,
        year: weekData.year,
        weekNumber: weekData.weekNumber,
        appointmentRate: data?.appointmentRate ?? 0,
        avgJobSize: data.avgJobSize ?? 0,
        closeRate: data?.closeRate ?? 0,
        com: data.com ?? 0,
        revenue: data?.revenue ?? 0,
        showRate: data?.showRate ?? 0,
        queryType: queryType,
      };    

      console.log(`Default target:`, defaultTarget);

      // Try to find an existing target
      const existingTarget = await this.targetRepository.findTargetByStartDate(
        userId,
        startDate,
        queryType
      );
      
      console.log(`Existing target found:`, !!existingTarget);
        
      let target: IWeeklyTargetDocument | null;
      if (existingTarget) {
        // If target exists, update it with new data and queryType
        console.log(`Updating existing target`);
        target = await this.targetRepository.updateTarget({
          ...existingTarget.toObject(),
          ...data,
          queryType, // Update the queryType
        });
        console.log("Target updated successfully");
      } else {
        // If no target exists, create a new one
        console.log(`Creating new target`);
        target = await this.targetRepository.createTarget({
          ...defaultTarget,
          queryType,
        });
        console.log("Target created successfully");
      }

      if (!target) {
        console.error("Failed to update or create weekly target");
        throw new Error("Failed to update or create weekly target.");
      }
      
      console.log(`Final target:`, target);
      return target;
    } catch (error) {
      console.error('Error in upsertWeeklyTarget:', error);
      throw error;
    }
  }

  private async _upsertMonthlyTarget(
    userId: string,
    startDate: string,
    endDate: string,
    data: Partial<IWeeklyTarget>,
    queryType: string
  ): Promise<IWeeklyTargetDocument | IWeeklyTargetDocument[]> {
    try {
      console.log(`=== Processing monthly target ===`);
      console.log(`userId: ${userId}`);
      console.log(`startDate: ${startDate}`);
      console.log(`endDate: ${endDate}`);
      console.log(`queryType: ${queryType}`);
      console.log(`data:`, data);
      
      const weeksInMonth = DateUtils.getMonthWeeks(startDate, endDate);
      console.log(`Weeks found: ${weeksInMonth.length}`);
      console.log('Weeks:', JSON.stringify(weeksInMonth, null, 2));
      
      if (weeksInMonth.length === 0) {
        console.log('No weeks found, returning empty aggregate');
        return this._aggregateTargets([], queryType, userId, startDate, endDate);
      }
      
      const monthlyProratedData: Partial<IWeeklyTarget> = {
        ...data,
        revenue: data.revenue ? data.revenue / weeksInMonth.length : 0,
        avgJobSize: data.avgJobSize ? data.avgJobSize : 0,
        appointmentRate: data.appointmentRate ? data.appointmentRate : 0,
        showRate: data.showRate ? data.showRate : 0,
        closeRate: data.closeRate ? data.closeRate : 0,
        com: data.com ? data.com : 0,
      };
      
      console.log(`Monthly prorated data:`, monthlyProratedData);
      
      const monthlyUpsertPromises = weeksInMonth.map((week, index) => {
        console.log(`Creating weekly target ${index + 1}: ${week.weekStart} to ${week.weekEnd}`);
        return this.upsertWeeklyTarget(
          userId,
          week.weekStart,
          week.weekEnd,
          monthlyProratedData,
          queryType
        );
      });
      
      const monthlyResults = await Promise.all(monthlyUpsertPromises);
      console.log(`Created ${monthlyResults.length} weekly targets`);
      
      // Always aggregate the results into a monthly summary
      console.log(`Aggregating ${monthlyResults.length} weekly targets into monthly summary`);
      return this._aggregateTargets(monthlyResults, queryType, userId, startDate, endDate);
    } catch (error) {
      console.error('Error in _upsertMonthlyTarget:', error);
      throw error;
    }
  }

  public async upsertTargetByPeriod(
    userId: string,
    startDate: string,
    endDate: string,
    queryType: "weekly" | "monthly" | "yearly",
    data: Partial<IWeeklyTarget>
  ): Promise<IWeeklyTargetDocument | IWeeklyTargetDocument[]> {
    try {
      console.log(`=== upsertTargetByPeriod ===`);
      console.log(`userId: ${userId}`);
      console.log(`startDate: ${startDate}`);
      console.log(`endDate: ${endDate}`);
      console.log(`queryType: ${queryType}`);
      console.log(`data:`, data);
      
      switch (queryType) {
        case "weekly":
          console.log(`Processing as weekly target`);
          return this.upsertWeeklyTarget(userId, startDate, endDate, data, queryType);
          
        case "monthly":
          console.log(`Processing as monthly target`);
          return this._upsertMonthlyTarget(
            userId,
            startDate,
            endDate,
            data,
            queryType
          );
        case "yearly":
          console.log(`Processing as yearly target`);
          // For yearly, process as monthly but return all weekly targets
          return this._upsertMonthlyTarget(
            userId,
            startDate,
            endDate,
            data,
            queryType
          );
        default:
          throw new Error(`Invalid queryType: ${queryType}`);
      }
    } catch (error) {
      console.error(`Error in upsertTargetByPeriod:`, error);
      console.error(`Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
      throw error;
    }
  }

  public async getWeeklyTargetsInRange(
    userId: string,
    startDate: string,
    endDate: string,
    queryType: string = "monthly"
  ): Promise<IWeeklyTargetDocument[]> {
    console.log(`=== Getting Weekly Targets In Range ===`);
    console.log(`userId: ${userId}`);
    console.log(`startDate: ${startDate}`);
    console.log(`endDate: ${endDate}`);
    console.log(`queryType: ${queryType}`);
    
    // Get all weeks in the specified date range
    const weeksInRange = DateUtils.getMonthWeeks(startDate, endDate);
    console.log(`Weeks in range: ${weeksInRange.length}`);
    console.log('Weeks:', weeksInRange);
    
    if (weeksInRange.length === 0) {
      console.log('No weeks found in the specified range');
      return [];
    }
    
    // Get weekly targets for each week in the range
    const weeklyTargets = await Promise.all(
      weeksInRange.map(week => 
        this.getWeeklyTarget(userId, week.weekStart, week.weekEnd, queryType)
      )
    );
    
    console.log(`Found ${weeklyTargets.length} weekly targets`);
    
    // Filter targets by queryType
    const filteredTargets = weeklyTargets.filter(target => 
      !queryType || target.queryType === queryType
    );
    
    console.log(`Filtered to ${filteredTargets.length} targets with queryType: ${queryType}`);
    
    return filteredTargets;
  }

  public async getWeeklyTarget(
    userId: string,
    startDate: string,
    endDate?: string,
    queryType: string = "monthly"
  ): Promise<IWeeklyTargetDocument> {
    console.log(`=== Getting Weekly Target ===`);
    console.log(`userId: ${userId}`);
    console.log(`startDate: ${startDate}`);
    console.log(`queryType: ${queryType}`);
    
    const weekInfo = DateUtils.getWeekDetails(startDate);
    console.log(`Week info:`, weekInfo);
    
    // First try to find target with the specified queryType
    let target = await this.targetRepository.findTargetByStartDate(
      userId,
      weekInfo.weekStart,
      queryType
    );
    
    // If not found and queryType is "yearly", also try to find with "monthly" queryType
    if (!target && queryType === "yearly") {
      console.log(`Target not found with queryType "yearly", trying "monthly"`);
      target = await this.targetRepository.findTargetByStartDate(
        userId,
        weekInfo.weekStart,
        "monthly"
      );
    }
    
    console.log(`Target found:`, !!target);
    
    if (!target) {
      // Return an object with 0 values if no target is found
      const defaultTarget = {
        userId,
        startDate: weekInfo.weekStart,
        endDate: weekInfo.weekEnd,
        appointmentRate: 0,
        avgJobSize: 0,
        closeRate: 0,
        com: 0,
        revenue: 0,
        showRate: 0,
        queryType: queryType,
        year: weekInfo.year,
        weekNumber: weekInfo.weekNumber,
      } as unknown as IWeeklyTargetDocument;
      
      console.log(`Returning default target:`, defaultTarget);
      return defaultTarget;
    }
    
    console.log(`Returning found target:`, target);
    return target;
  }

  public async getAggregatedMonthlyTarget(
    userId: string,
    startDate: string,
    endDate: string,
    queryType: string
  ): Promise<IWeeklyTargetDocument[]> {
    console.log(`=== Getting Monthly Targets ===`);
    console.log(`userId: ${userId}`);
    console.log(`startDate: ${startDate}`);
    console.log(`endDate: ${endDate}`);
    console.log(`queryType: ${queryType}`);
    
    const weeksInMonth = DateUtils.getMonthWeeks(startDate, endDate);
    console.log(`Weeks in month: ${weeksInMonth.length}`);
    
    if (weeksInMonth.length === 0) {
      console.log('No weeks found in the month');
      return [];
    }

    // Use getWeeklyTarget and pass the queryType parameter
    const weeklyTargets = await Promise.all(
      weeksInMonth.map(week =>
        this.getWeeklyTarget(userId, week.weekStart, week.weekEnd, queryType)
      )
    );
    
    console.log(`Found ${weeklyTargets.length} weekly targets`);
    
    // Filter targets by queryType
    const filteredTargets = weeklyTargets.filter(target => 
      !queryType || target.queryType === queryType
    );
    
    console.log(`Filtered to ${filteredTargets.length} targets with queryType: ${queryType}`);
    
    if (filteredTargets.length === 0) {
      console.log('No targets found with the specified queryType');
      // Return a zero-filled monthly summary
      return [this._aggregateTargets([], queryType, userId, startDate, endDate)];
    }
    
    // Aggregate all weekly targets into a monthly summary
    const monthlySummary = this._aggregateTargets(filteredTargets, queryType, userId, startDate, endDate);
    
    console.log(`Returning monthly summary:`, monthlySummary);
    return [monthlySummary];
  }

  // Debug method to check what targets exist in the database
  public async debugTargetsInDatabase(userId: string): Promise<any> {
    console.log(`=== Debug: Checking all targets for userId: ${userId} ===`);
    
    try {
      // Get all targets for this user from the database
      const allTargets = await this.targetRepository.debugAllTargetsForUser(userId);
      
      console.log(`Total targets found for userId ${userId}: ${allTargets.length}`);
      
      if (allTargets.length > 0) {
        console.log(`Sample targets:`, allTargets.slice(0, 5).map(t => ({
          startDate: t.startDate,
          endDate: t.endDate,
          queryType: t.queryType,
          year: t.year,
          weekNumber: t.weekNumber
        })));
      }
      
      return {
        totalTargets: allTargets.length,
        targets: allTargets.map(t => ({
          startDate: t.startDate,
          endDate: t.endDate,
          queryType: t.queryType,
          year: t.year,
          weekNumber: t.weekNumber
        }))
      };
    } catch (error) {
      console.error(`Error in debugTargetsInDatabase:`, error);
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  public async getAggregatedYearlyTarget(
    userId: string,
    startDate: string,
    endDate: string,
    queryType: string
  ): Promise<IWeeklyTargetDocument[][]> {
    console.log(`=== Getting Yearly Targets ===`);
    console.log(`userId: ${userId}`);
    console.log(`startDate: ${startDate}`);
    console.log(`endDate: ${endDate}`);
    console.log(`queryType: ${queryType}`);
    
    // Parse the provided date range
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    
    console.log(`Parsed startDateObj: ${startDateObj.toISOString()}`);
    console.log(`Parsed endDateObj: ${endDateObj.toISOString()}`);
    
    // Get all targets within the date range from the database
    const allTargetsInRange = await this.targetRepository.getTargetsByDateRangeAndQueryType(
      startDateObj,
      endDateObj,
      userId,
      queryType
    );
    
    console.log(`Found ${allTargetsInRange.length} targets in date range`);
    console.log(`All targets in range:`, allTargetsInRange.map(t => ({
      startDate: t.startDate,
      endDate: t.endDate,
      queryType: t.queryType,
      userId: t.userId
    })));
    
    // Filter targets by queryType
    const filteredTargets = allTargetsInRange.filter(target => 
      !queryType || target.queryType === queryType
    );
    
    console.log(`Filtered to ${filteredTargets.length} targets with queryType: ${queryType}`);
    console.log(`Filtered targets:`, filteredTargets.map(t => ({
      startDate: t.startDate,
      endDate: t.endDate,
      queryType: t.queryType,
      userId: t.userId
    })));
    
    if (filteredTargets.length === 0) {
      console.log('No targets found in the specified range');
      return [];
    }
    
    // Check if we have monthly targets (one per month) or weekly targets
    const isMonthlyTargets = filteredTargets.every(target => {
      const startDate = new Date(target.startDate);
      const endDate = new Date(target.endDate);
      const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      return daysDiff >= 28; // If target spans 28+ days, it's likely a monthly target
    });
    
    console.log(`Detected target type: ${isMonthlyTargets ? 'monthly' : 'weekly'}`);
    
    if (isMonthlyTargets) {
      // We have monthly targets, but user wants weekly format
      // We need to convert monthly targets to weekly targets
      const yearlyResults: IWeeklyTargetDocument[][] = [];
      
      // Sort targets by startDate
      const sortedTargets = filteredTargets.sort((a, b) => 
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      );
      
      // For each monthly target, create weekly targets
      for (const monthlyTarget of sortedTargets) {
        const monthStartDate = new Date(monthlyTarget.startDate);
        const monthEndDate = new Date(monthlyTarget.endDate);
        
        // Get all weeks in this month
        const { DateUtils } = await import('../../../utils/date.utils.js');
        const weeksInMonth = DateUtils.getMonthWeeks(
          monthStartDate.toISOString().split('T')[0],
          monthEndDate.toISOString().split('T')[0]
        );
        
        // Create weekly targets for this month
        const weeklyTargetsForMonth: IWeeklyTargetDocument[] = [];
        
        for (const week of weeksInMonth) {
          // Prorate the monthly values to weekly
          const weeklyTarget = {
            ...monthlyTarget,
            startDate: week.weekStart,
            endDate: week.weekEnd,
            year: week.year,
            weekNumber: week.weekNumber,
            // Prorate revenue and other metrics based on weeks in month
            revenue: Math.round(monthlyTarget.revenue / weeksInMonth.length),
            appointmentRate: monthlyTarget.appointmentRate,
            avgJobSize: monthlyTarget.avgJobSize,
            closeRate: monthlyTarget.closeRate,
            com: monthlyTarget.com,
            showRate: monthlyTarget.showRate,
            queryType: monthlyTarget.queryType
          } as IWeeklyTargetDocument;
          
          weeklyTargetsForMonth.push(weeklyTarget);
        }
        
        yearlyResults.push(weeklyTargetsForMonth);
      }
      
      console.log(`Returning ${yearlyResults.length} months with weekly targets (converted from monthly)`);
      return yearlyResults;
    } else {
      // We have weekly targets, group them by month
      const monthlyGroups = new Map<string, IWeeklyTargetDocument[]>();
      
      for (const target of filteredTargets) {
        const targetDate = new Date(target.startDate);
        const monthKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
        
        if (!monthlyGroups.has(monthKey)) {
          monthlyGroups.set(monthKey, []);
        }
        monthlyGroups.get(monthKey)!.push(target);
      }
      
      // Create array of arrays - each inner array represents weeks of a month
      const yearlyResults: IWeeklyTargetDocument[][] = [];
      
      // Sort months chronologically
      const sortedMonthKeys = Array.from(monthlyGroups.keys()).sort();
      
      for (const monthKey of sortedMonthKeys) {
        const weekTargets = monthlyGroups.get(monthKey)!;
        
        // Sort weeks within the month by startDate
        weekTargets.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
        
        yearlyResults.push(weekTargets);
      }
      
      console.log(`Returning ${yearlyResults.length} months with weekly targets`);
      return yearlyResults;
    }
  }
}