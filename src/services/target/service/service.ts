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
    userId?: string
  ): IWeeklyTargetDocument {
    if (targets.length === 0) {
      return {
        userId: userId || "",
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
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

    const aggregated: IWeeklyTarget = {
      userId: targets[0].userId,
      startDate: targets[0].startDate,
      endDate: targets[targets.length - 1].endDate,
      year: targets[0].year,
      weekNumber: targets[0].weekNumber,
      appointmentRate: 0,
      avgJobSize: 0,
      closeRate: 0,
      com: 0,
      revenue: 0,
      showRate: 0,
      queryType: targets[0].queryType || "",
    };

    for (const target of targets) {
      aggregated.revenue += target.revenue || 0;
    }
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
        return this._aggregateTargets([], queryType, userId);
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
      
      // For yearly queryType, return all weekly targets instead of aggregating
      if (queryType === "yearly") {
        console.log(`Returning ${monthlyResults.length} weekly targets for yearly queryType`);
        return monthlyResults;
      }
      
      console.log(`Aggregating ${monthlyResults.length} weekly targets`);
      return this._aggregateTargets(monthlyResults, queryType, userId);
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
    switch (queryType) {
      case "weekly":
        return this.upsertWeeklyTarget(userId, startDate, endDate, data, "monthly");
        
      case "monthly":
        return this._upsertMonthlyTarget(
          userId,
          startDate,
          endDate,
          data,
          queryType
        );
      case "yearly":
        // For yearly, process as monthly but return all weekly targets
        return this._upsertMonthlyTarget(
          userId,
          startDate,
          endDate,
          data,
          queryType
        );
      default:
        throw new Error("Invalid queryType");
    }
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
    return weeklyTargets;
  }

  public async getAggregatedYearlyTarget(
    userId: string,
    startDate: string,
    endDate: string,
    queryType: string
  ): Promise<IWeeklyTargetDocument[]> {
    console.log(`=== Getting Yearly Targets ===`);
    console.log(`userId: ${userId}`);
    console.log(`startDate: ${startDate}`);
    console.log(`endDate: ${endDate}`);
    console.log(`queryType: ${queryType}`);
    
    // Parse the provided date range
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    
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
    
    // Filter out targets that don't match the queryType (if specified)
    const filteredTargets = weeklyTargets.filter(target => 
      !queryType || target.queryType === queryType
    );
    
    console.log(`Filtered to ${filteredTargets.length} targets with queryType: ${queryType}`);
    
    return filteredTargets;
  }
}