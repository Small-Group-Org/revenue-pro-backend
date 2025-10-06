import { IWeeklyTarget } from "../domain/target.domain.js";
import { IWeeklyTargetDocument } from "../repository/models/target.model.js";
import { TargetRepository } from "../repository/repository.js";
import { DateUtils } from "../../../utils/date.utils.js";
import { FormData } from "retell-sdk/_shims/registry.mjs";

export class TargetService {
  private targetRepository: TargetRepository;

  constructor() {
    this.targetRepository = new TargetRepository();
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
        managementCost: 0,
        queryType: queryType,
        year: new Date().getFullYear(),
        weekNumber: 0,
      } as unknown as IWeeklyTargetDocument;
    }
    
    const aggregated: IWeeklyTarget = {
      userId: targets[0].userId,
      startDate: startDate || targets[0].startDate,
      endDate: endDate || targets[targets.length - 1].endDate,
      year: targets[0].year,
      weekNumber: targets[0].weekNumber,
      appointmentRate: 0,
      avgJobSize: 0,
      closeRate: 0,
      com: 0,
      revenue: 0,
      showRate: 0,
      managementCost: 0,
      queryType: targets[0].queryType || queryType,
    };

    for (const target of targets) {
      aggregated.revenue += target.revenue || 0;
      aggregated.managementCost += target.managementCost || 0;
    }
    aggregated.avgJobSize = targets[0].avgJobSize || 0;
    aggregated.appointmentRate = targets[0].appointmentRate || 0;
    aggregated.showRate = targets[0].showRate || 0;
    aggregated.closeRate = targets[0].closeRate || 0;
    aggregated.com = targets[0].com || 0;

    return aggregated as IWeeklyTargetDocument;
  }

  private validateQueryTypeChange(existingQueryType: string, newQueryType: string): boolean {
    // console.log(`Validating query type change: ${existingQueryType} → ${newQueryType}`);
    
    // Allowed changes
    const allowedChanges: Record<string, string[]> = {
      'weekly': ['monthly', 'yearly'],
      'monthly': ['yearly'],
      'yearly': [] // No changes allowed from yearly
    };
    
    const allowedTargets = allowedChanges[existingQueryType] || [];
    const isAllowed = allowedTargets.includes(newQueryType);
    
    // console.log(`Allowed targets for ${existingQueryType}:`, allowedTargets);
    // console.log(`Change ${existingQueryType} → ${newQueryType} is ${isAllowed ? 'ALLOWED' : 'NOT ALLOWED'}`);
    
    return isAllowed;
  }

  private isDateInPastOrCurrent(targetDate: string, queryType: "weekly" | "monthly" | "yearly"): boolean {
    const now = new Date();
    const target = new Date(targetDate);
    
    switch (queryType) {
      case "weekly":
        // For weekly, check if the week has already started
        const weekStart = new Date(target);
        weekStart.setDate(target.getDate() - target.getDay() + 1); // Monday of the week
        return weekStart <= now;
        
      case "monthly":
        // For monthly, check if the month has already started
        const monthStart = new Date(target.getFullYear(), target.getMonth(), 1);
        return monthStart <= now;
        
      case "yearly":
        // For yearly, check if the year has already started
        const yearStart = new Date(target.getFullYear(), 0, 1);
        return yearStart <= now;
        
      default:
        return false;
    }
  }

  public async upsertWeeklyTarget(
    userId: string,
    startDate: string,
    endDate: string,
    data: Partial<IWeeklyTarget>,
    queryType: string
  ): Promise<IWeeklyTargetDocument> {
    try {
      // console.log(`=== Upserting Weekly Target ===`);
      // console.log(`userId: ${userId}, startDate: ${startDate}, queryType: ${queryType}`);
      
      // For direct weekly updates, prevent editing past/current weeks.
      // Monthly/Yearly updates have their own checks in upsertTargetByPeriod.
      // if (queryType === 'weekly' && this.isDateInPastOrCurrent(startDate, 'weekly')) {
      //   throw new Error(`Cannot modify targets for past or current weekly periods.`);
      // }

      const weekInfo = DateUtils.getWeekDetails(startDate);

      // Find any existing target for this week (there can only be one due to unique index)
      const existingTarget = await this.targetRepository.findTargetByStartDate(userId, weekInfo.weekStart);

      if (existingTarget) {
        // console.log(`Found existing target with queryType: ${existingTarget.queryType}`);
        let finalQueryType = existingTarget.queryType; // Default to not changing it

        // If requested queryType is different, check if upgrade is allowed
        if (existingTarget.queryType !== queryType) {
          if (this.validateQueryTypeChange(existingTarget.queryType, queryType)) {
            finalQueryType = queryType; // It's an allowed upgrade
            // console.log(`Query type change from ${existingTarget.queryType} to ${finalQueryType} is allowed.`);
          } else {
            // console.log(`Query type change from ${existingTarget.queryType} to ${queryType} is NOT allowed. Data will be updated, but queryType will remain ${existingTarget.queryType}.`);
          }
        }

        // Filter out 0 values from data to avoid overwriting existing values with 0
        const filteredData = Object.fromEntries(
          Object.entries(data).filter(([key, value]) => value !== 0 && value !== null && value !== undefined)
        );

        const updatedData = {
          ...existingTarget.toObject(),
          ...filteredData,
          queryType: finalQueryType,
        };

        const target = await this.targetRepository.updateTarget(updatedData);
        if (!target) {
            throw new Error("Failed to update weekly target.");
        }
        // console.log("Target updated successfully");
        return target;
      } else {
        // No existing target, create a new one
        // console.log(`No existing target found. Creating new target with queryType: ${queryType}`);
        const newTargetData: IWeeklyTarget = {
          userId,
          startDate: weekInfo.weekStart,
          endDate: weekInfo.weekEnd,
          year: weekInfo.year,
          weekNumber: weekInfo.weekNumber,
          appointmentRate: data?.appointmentRate ?? 0,
          avgJobSize: data.avgJobSize ?? 0,
          closeRate: data?.closeRate ?? 0,
          com: data.com ?? 0,
          revenue: data?.revenue ?? 0,
          showRate: data?.showRate ?? 0,
          managementCost: data?.managementCost ?? 0,
          queryType: queryType,
        };
        const target = await this.targetRepository.createTarget(newTargetData);
        if (!target) {
            throw new Error("Failed to create weekly target.");
        }
        // console.log("New target created successfully");
        return target;
      }
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
      // console.log(`=== Processing monthly target ===`);
      
      // Check if the target date is in the past or current period
      // if (this.isDateInPastOrCurrent(startDate, "monthly")) {
      //   const existingTargets = await this.getWeeklyTargetsInRange(userId, startDate, endDate, queryType);
        
      //   if (existingTargets.length > 0) {
      //     return existingTargets;
      //   } else {
      //     return [];
      //   }
      // }
      
      const weeksInMonth = DateUtils.getMonthWeeks(startDate, endDate);
      if (weeksInMonth.length === 0) {
        return [];
      }
      
      // Preserve the overall monthly revenue by distributing it equally across weeks
      const monthlyProratedData: Partial<IWeeklyTarget> = {
        ...data,
        revenue: data.revenue ? data.revenue / weeksInMonth.length : 0,
        avgJobSize: data.avgJobSize ? data.avgJobSize : 0,
        appointmentRate: data.appointmentRate ? data.appointmentRate : 0,
        showRate: data.showRate ? data.showRate : 0,
        closeRate: data.closeRate ? data.closeRate : 0,
        com: data.com ? data.com : 0,
        managementCost: data.managementCost ? data.managementCost / weeksInMonth.length : 0,
      };
      
      const monthlyUpsertPromises = weeksInMonth.map((week, index) => {
        return this.upsertWeeklyTarget(
          userId,
          week.weekStart,
          week.weekEnd,
          monthlyProratedData,
          queryType
        );
      });
      
      const monthlyResults = await Promise.all(monthlyUpsertPromises);
      return monthlyResults;
    } catch (error) {
      console.error('Error in _upsertMonthlyTarget:', error);
      throw error;
    }
  }

  private async _upsertYearlyTarget(
    userId: string,
    startDate: string,
    endDate: string,
    data: Partial<IWeeklyTarget>,
    queryType: string
  ): Promise<IWeeklyTargetDocument[][]> {
    try {
      // console.log(`=== Processing yearly target ===`);

      // Original yearly logic for full year targets
      const year = new Date(startDate).getFullYear();
      const currentDate = new Date();
      const currentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      
      // Check if the target year is in the past or current
      if (this.isDateInPastOrCurrent(startDate, "yearly")) {
        // console.log(`Target year is current or previous. Returning existing data without changes.`);
        
        // Get existing targets for this year
        const existingTargets = await this.getWeeklyTargetsInRange(userId, startDate, endDate, queryType);
        
        if (existingTargets.length > 0) {
          // console.log(`Found ${existingTargets.length} existing targets for current/previous year`);
          // Return array of arrays (organized by months) of existing weekly targets
          const monthlyTargets: IWeeklyTargetDocument[][] = [];
          const targetsByMonth = new Map<string, IWeeklyTargetDocument[]>();
          
          for (const target of existingTargets) {
            const weekStart = new Date(target.startDate);
            const weekEnd = new Date(target.endDate);
            
            // Count days in each month for this week
            const daysInMonth = new Map<number, number>();
            for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
              const month = d.getMonth();
              daysInMonth.set(month, (daysInMonth.get(month) || 0) + 1);
            }
            
            // Determine the month with the most days
            let maxDays = 0;
            let targetMonth = weekStart.getMonth();
            for (const [month, days] of daysInMonth.entries()) {
              if (days > maxDays) {
                maxDays = days;
                targetMonth = month;
              }
            }
            
            let targetYear = weekStart.getFullYear();
            if (targetMonth === 0 && weekStart.getMonth() === 11) {
              targetYear = weekEnd.getFullYear();
            }
            
            const monthKey = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;
            if (!targetsByMonth.has(monthKey)) {
              targetsByMonth.set(monthKey, []);
            }
            targetsByMonth.get(monthKey)!.push(target);
          }
          
          for (let month = 0; month < 12; month++) {
            const monthKey = year + '-' + (month + 1);
            monthlyTargets.push(targetsByMonth.get(monthKey) || []);
          }
          
          return monthlyTargets;
        } else {
          // console.log(`No existing targets found for current/previous year`);
          // Return empty array of arrays for current/previous year with no existing data
          return Array(12).fill([]);
        }
      }
      
      // First pass: Calculate total revenue of current and previous months
      let totalCurrentPreviousRevenue = 0;
      const currentPreviousTargets: IWeeklyTargetDocument[] = [];
      
      for (let month = 0; month < 12; month++) {
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 0);
        
        // Check if this month is current or previous
        if (monthStart <= currentMonth) {
          
          // Get existing targets for this month
          const existingTargets = await this.getWeeklyTargetsInRange(
            userId, 
            monthStart.toISOString().split('T')[0], 
            monthEnd.toISOString().split('T')[0], 
            queryType
          );
          
          if (existingTargets.length > 0) {
            // Sum up the revenue for this month
            const monthRevenue = existingTargets.reduce((sum, target) => sum + (target.revenue || 0), 0);
            totalCurrentPreviousRevenue += monthRevenue;
            currentPreviousTargets.push(...existingTargets);
          } else {
            const weeksInMonth = DateUtils.getMonthWeeks(
              monthStart.toISOString().split('T')[0], 
              monthEnd.toISOString().split('T')[0]
            );
            
            for (const week of weeksInMonth) {
              const zeroFilledTarget = await this.upsertWeeklyTarget(
                userId,
                week.weekStart,
                week.weekEnd,
                {
                  ...data,
                  revenue: 0, // Zero revenue for current/previous months
                  avgJobSize: data.avgJobSize || 0,
                  appointmentRate: data.appointmentRate || 0,
                  showRate: data.showRate || 0,
                  closeRate: data.closeRate || 0,
                  com: data.com || 0,
                  managementCost: data.managementCost || 0,
                },
                queryType
              );
              currentPreviousTargets.push(zeroFilledTarget);
            }
          }
        }
      }
      
      const remainingRevenue = (data.revenue || 0) - totalCurrentPreviousRevenue;
      let futureMonthsCount = 0;
      let totalFutureWeeks = 0;
      
      for (let month = 0; month < 12; month++) {
        const monthStart = new Date(year, month, 1);
        if (monthStart > currentMonth) {
          futureMonthsCount++;
          const monthEnd = new Date(year, month + 1, 0);
          const weeksInMonth = DateUtils.getMonthWeeks(
            monthStart.toISOString().split('T')[0], 
            monthEnd.toISOString().split('T')[0]
          );
          // console.log(`Weeks in month: ${weeksInMonth.length} for month ${month + 1}`);
          totalFutureWeeks += weeksInMonth.length;
        }
      }
      
      // Calculate revenue per week for future months
      const revenuePerWeek = totalFutureWeeks > 0 ? remainingRevenue / totalFutureWeeks : 0;
      
      // Create array of arrays - one array per month
      const monthlyTargets: IWeeklyTargetDocument[][] = [];
      
      // Second pass: Process all months and organize by month
      for (let month = 0; month < 12; month++) {
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 0);
        const monthTargets: IWeeklyTargetDocument[] = [];
        
        if (monthStart <= currentMonth) {
          // Current/previous month: get existing targets
          const existingTargets = await this.getWeeklyTargetsInRange(
            userId, 
            monthStart.toISOString().split('T')[0], 
            monthEnd.toISOString().split('T')[0], 
            queryType
          );
          
          if (existingTargets.length > 0) {
            // Filter targets to only include those that belong to this month based on majority of days
            for (const target of existingTargets) {
              const weekStart = new Date(target.startDate);
              const weekEnd = new Date(target.endDate);
              
              // Count days in each month for this week
              const daysInMonth = new Map<number, number>();
              for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
                const month = d.getMonth();
                daysInMonth.set(month, (daysInMonth.get(month) || 0) + 1);
              }
              
              // Determine the month with the most days
              let maxDays = 0;
              let targetMonth = weekStart.getMonth();
              for (const [weekMonth, days] of daysInMonth.entries()) {
                if (days > maxDays) {
                  maxDays = days;
                  targetMonth = weekMonth;
                }
              }
              
              // Only include this target if it belongs to the current month being processed
              if (targetMonth === month) {
                monthTargets.push(target);
              }
            }
          } else {
            // Create zero-filled weekly targets for current/previous months
            const weeksInMonth = DateUtils.getMonthWeeks(
              monthStart.toISOString().split('T')[0], 
              monthEnd.toISOString().split('T')[0]
            );

            for (const week of weeksInMonth) {
              const weekStart = new Date(week.weekStart);
              const weekEnd = new Date(week.weekEnd);
              
              // Count days in each month for this week
              const daysInMonth = new Map<number, number>();
              for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
                const weekMonth = d.getMonth();
                daysInMonth.set(weekMonth, (daysInMonth.get(weekMonth) || 0) + 1);
              }
              
              // Determine the month with the most days
              let maxDays = 0;
              let targetMonth = weekStart.getMonth();
              for (const [weekMonth, days] of daysInMonth.entries()) {
                if (days > maxDays) {
                  maxDays = days;
                  targetMonth = weekMonth;
                }
              }
              
              // Only create this target if it belongs to the current month being processed
              if (targetMonth === month) {
                const zeroFilledTarget = await this.upsertWeeklyTarget(
                  userId,
                  week.weekStart,
                  week.weekEnd,
                  {
                    ...data,
                    revenue: 0, // Zero revenue for current/previous months
                    avgJobSize: data.avgJobSize || 0,
                    appointmentRate: data.appointmentRate || 0,
                    showRate: data.showRate || 0,
                    closeRate: data.closeRate || 0,
                    com: data.com || 0,
                    managementCost: data.managementCost || 0,
                  },
                  queryType
                );
                monthTargets.push(zeroFilledTarget);
              }
            }
          }
        } else {
          const weeksInMonth = DateUtils.getMonthWeeks(
            monthStart.toISOString().split('T')[0], 
            monthEnd.toISOString().split('T')[0]
          );
          
          if (weeksInMonth.length > 0) {
            const monthlyData: Partial<IWeeklyTarget> = {
              ...data,
              revenue: revenuePerWeek,
              avgJobSize: data.avgJobSize || 0,
              appointmentRate: data.appointmentRate || 0,
              showRate: data.showRate || 0,
              closeRate: data.closeRate || 0,
              com: data.com || 0,
              managementCost: data.managementCost || 0,
            };
            
            // Create weekly targets for this month
            for (const week of weeksInMonth) {
              const weekStart = new Date(week.weekStart);
              const weekEnd = new Date(week.weekEnd);
              
              // Count days in each month for this week
              const daysInMonth = new Map<number, number>();
              for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
                const weekMonth = d.getMonth();
                daysInMonth.set(weekMonth, (daysInMonth.get(weekMonth) || 0) + 1);
              }
              
              // Determine the month with the most days
              let maxDays = 0;
              let targetMonth = weekStart.getMonth();
              for (const [weekMonth, days] of daysInMonth.entries()) {
                if (days > maxDays) {
                  maxDays = days;
                  targetMonth = weekMonth;
                }
              }
              
              // Only create this target if it belongs to the current month being processed
              if (targetMonth === month) {
                const weeklyTarget = await this.upsertWeeklyTarget(
                  userId,
                  week.weekStart,
                  week.weekEnd,
                  monthlyData,
                  queryType
                );
                monthTargets.push(weeklyTarget);
              }
            }
          }
        }
        
        monthlyTargets.push(monthTargets);
      }
      
      return monthlyTargets;
    } catch (error) {
      console.error('Error in _upsertYearlyTarget:', error);
      throw error;
    }
  }

  public async upsertTargetByPeriod(
    userId: string,
    startDate: string,
    endDate: string,
    queryType: "weekly" | "monthly" | "yearly",
    data: Partial<IWeeklyTarget>
  ): Promise<IWeeklyTargetDocument | IWeeklyTargetDocument[] | IWeeklyTargetDocument[][]> {
    try {
      switch (queryType) {
        case "weekly":
          // console.log(`Processing as weekly target`);
          return this.upsertWeeklyTarget(userId, startDate, endDate, data, queryType);
          
        case "monthly":
          // console.log(`Processing as monthly target`);
          return this._upsertMonthlyTarget(
            userId,
            startDate,
            endDate,
            data,
            queryType
          );
        case "yearly":
          return this._upsertYearlyTarget(
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

  public async getWeeklyTarget(
    userId: string,
    startDate: string,
  ): Promise<IWeeklyTargetDocument> {
    const weekInfo = DateUtils.getWeekDetails(startDate);
    
    // console.log(`=== getWeeklyTarget ===`);
    // console.log(`userId: ${userId}, startDate: ${startDate}, weekStart: ${weekInfo.weekStart}, year: ${weekInfo.year}, weekNumber: ${weekInfo.weekNumber}`);
    
    // Search for the target for this week (there can only be one per week per user)
    const target = await this.targetRepository.findTargetByStartDate(userId, weekInfo.weekStart);
    
    if (!target) {
      // console.log(`No target found for week ${weekInfo.weekStart}`);
      // Return an object with 0 values if no target is found
      return {
        userId,
        startDate: weekInfo.weekStart,
        endDate: weekInfo.weekEnd,
        appointmentRate: 0,
        avgJobSize: 0,
        closeRate: 0,
        com: 0,
        revenue: 0,
        showRate: 0,
        managementCost: 0,
        queryType: "",
        year: weekInfo.year,
        weekNumber: weekInfo.weekNumber,
      } as unknown as IWeeklyTargetDocument;
    }
    
    // console.log(`Found target for week ${weekInfo.weekStart}: queryType=${target.queryType}, revenue=${target.revenue}`);
    return target;
  }

  public async getWeeklyTargetsInRange(
    userId: string,
    startDate: string,
    endDate: string,
    queryType: string = "any"
  ): Promise<IWeeklyTargetDocument[]> {
    // console.log(`=== Getting Weekly Targets In Range ===`);
    // console.log(`userId: ${userId}`);
    // console.log(`startDate: ${startDate}`);
    // console.log(`endDate: ${endDate}`);
    // console.log(`queryType: ${queryType}`);
    
    // Get all weeks in the specified date range
    const weeksInRange = DateUtils.getMonthWeeks(startDate, endDate);
    // console.log(`Weeks in range: ${weeksInRange.length}`);
    
    if (weeksInRange.length === 0) {
      // console.log('No weeks found in the specified range');
      return [];
    }
    
    // Get weekly targets for each week in the range
    // Since there can only be one target per week per user, we don't need to filter by queryType
    const weeklyTargets = await Promise.all(
      weeksInRange.map(week => 
        this.getWeeklyTarget(userId, week.weekStart)
      )
    );
    
    // console.log(`Found ${weeklyTargets.length} weekly targets`);
    
    // Return all targets without filtering by queryType
    // queryType parameter is now only used for timeframe determination
    // console.log(`Returning all ${weeklyTargets.length} targets in date range`);
    
    return weeklyTargets;
  }

  public async getAggregatedMonthlyTarget(
    userId: string,
    startDate: string,
    endDate: string,
    queryType: string
  ): Promise<IWeeklyTargetDocument[]> {
    // console.log(`=== Getting Monthly Targets ===`);
    // console.log(`userId: ${userId}`);
    // console.log(`startDate: ${startDate}`);
    // console.log(`endDate: ${endDate}`);
    // console.log(`queryType: ${queryType}`);
    
    const weeksInMonth = DateUtils.getMonthWeeks(startDate, endDate);
    // console.log(`Weeks in month: ${weeksInMonth.length}`);
    
    if (weeksInMonth.length === 0) {
      // console.log('No weeks found in the month');
      return [];
    }

    // Use getWeeklyTarget to get the target for each week (there can only be one per week per user)
    const weeklyTargets = await Promise.all(
      weeksInMonth.map(week =>
        this.getWeeklyTarget(userId, week.weekStart)
      )
    );
    
    // console.log(`Found ${weeklyTargets.length} weekly targets`);
    
    // Return all targets without filtering by queryType
    // queryType parameter is now only used for timeframe determination
    // console.log(`Returning all ${weeklyTargets.length} targets for the month`);
    
    return weeklyTargets;
  }

  public async getAggregatedYearlyTarget(
    userId: string,
    startDate: string,
    endDate: string,
    queryType: string
  ): Promise<IWeeklyTargetDocument[]> {
    // Parse the year from startDate
    const year = new Date(startDate).getFullYear();
    const results: IWeeklyTargetDocument[] = [];
    for (let month = 0; month < 12; month++) {
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 0);
      const monthStartStr = monthStart.toISOString().slice(0, 10);
      const monthEndStr = monthEnd.toISOString().slice(0, 10);
      // Get all weeks in this month
      const weeklyTargets = await this.getAggregatedMonthlyTarget(
          userId, 
        monthStartStr,
        monthEndStr,
        "monthly"
      );
      let aggregated;
  if (weeklyTargets.length === 0) {
    aggregated = {
      userId,
      startDate: monthStartStr,
      endDate: monthEndStr,
      appointmentRate: 0,
      avgJobSize: 0,
      closeRate: 0,
      com: 0,
      revenue: 0,
      showRate: 0,
      managementCost: 0,
      queryType: "monthly",
      year,
      weekNumber: 0,
    } as unknown as IWeeklyTargetDocument;
  } else {
    aggregated = this._aggregateTargets(weeklyTargets, "monthly");
    aggregated.year = year;
    aggregated.startDate = monthStartStr;
    aggregated.endDate = monthEndStr;
    aggregated.queryType = "monthly";
  }
  results.push(aggregated);
    }
    return results;
  }

  public async getYearlyTargetsOrganizedByMonths(
    userId: string,
    startDate: string,
    endDate: string,
    queryType: string
  ): Promise<IWeeklyTargetDocument[][]> {
    // console.log(`=== Getting Yearly Targets Organized By Months ===`);
    
    const year = new Date(startDate).getFullYear();
    const monthlyTargets: IWeeklyTargetDocument[][] = [];
    
    // Iterate through all 12 months
    for (let month = 0; month < 12; month++) {
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0);
      
      const monthStartStr = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}-${String(monthStart.getDate()).padStart(2, '0')}`;
      const monthEndStr = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, '0')}-${String(monthEnd.getDate()).padStart(2, '0')}`;
      
      const monthResults = await this.getAllWeeksOrganizedByMonths(
        userId,
        monthStartStr,
        monthEndStr,
        "monthly"
      );
      
      // Add the first (and only) month's data to our yearly results
      monthlyTargets.push(monthResults.length > 0 ? monthResults[0] : []);
    }
    
    // console.log(`Organized into ${monthlyTargets.length} months for year ${year}`);
    return monthlyTargets;
  }

  public async getAllWeeksOrganizedByMonths(
    userId: string,
    startDate: string,
    endDate: string,
    queryType: string
  ): Promise<IWeeklyTargetDocument[][]> {
    // console.log(`=== Getting Monthly Targets Organized By Months ===`);
    
    // This function now only handles monthly queries
    if (queryType !== "monthly") {
      throw new Error("getAllWeeksOrganizedByMonths only supports monthly queries. Use getYearlyTargetsOrganizedByMonths for yearly queries.");
    }
    
    const weeksInRange = DateUtils.getMonthWeeks(startDate, endDate);

    const allWeeklyTargets = await Promise.all(
      weeksInRange.map(week => 
        this.getWeeklyTarget(userId, week.weekStart)
      )
    );
    
    const monthlyGroups = new Map<string, IWeeklyTargetDocument[]>();

    for (const target of allWeeklyTargets) {
      const weekStart = new Date(target.startDate);
      const weekEnd = new Date(target.endDate);

      const daysInMonth = new Map<number, number>();
      for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
        const month = d.getMonth();
        daysInMonth.set(month, (daysInMonth.get(month) || 0) + 1);
      }

      let maxDays = 0;
      let targetMonth = weekStart.getMonth();
      for (const [month, days] of daysInMonth.entries()) {
        if (days > maxDays) {
          maxDays = days;
          targetMonth = month;
        }
      }

      // Only include weeks that belong to the requested month(s)
      const requestedStartDate = new Date(startDate);
      const requestedEndDate = new Date(endDate);
      const requestedStartMonth = requestedStartDate.getMonth();
      const requestedStartYear = requestedStartDate.getFullYear();
      const requestedEndMonth = requestedEndDate.getMonth();
      const requestedEndYear = requestedEndDate.getFullYear();
      
      let targetYear = weekStart.getFullYear();
      if (targetMonth === 0 && weekStart.getMonth() === 11) {
        targetYear = weekEnd.getFullYear();
      }
      
      // Check if the week belongs to any of the requested months
      let belongsToRequestedMonth = false;
      for (let year = requestedStartYear; year <= requestedEndYear; year++) {
        const monthStart = year === requestedStartYear ? requestedStartMonth : 0;
        const monthEnd = year === requestedEndYear ? requestedEndMonth : 11;
        
        for (let month = monthStart; month <= monthEnd; month++) {
          if (targetYear === year && targetMonth === month) {
            belongsToRequestedMonth = true;
            break;
          }
        }
        if (belongsToRequestedMonth) break;
      }
      
      if (!belongsToRequestedMonth) {
        // console.log(`Skipping week ${target.startDate} to ${target.endDate} - doesn't belong to requested month(s)`);
        continue;
      }

      const monthKey = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;

      if (!monthlyGroups.has(monthKey)) {
        monthlyGroups.set(monthKey, []);
      }
      monthlyGroups.get(monthKey)!.push(target);
    }

    // Convert to array of arrays, sorted by month
    const monthlyTargets: IWeeklyTargetDocument[][] = [];
    const sortedMonthKeys = Array.from(monthlyGroups.keys()).sort();
    for (const monthKey of sortedMonthKeys) {
      const weekTargets = monthlyGroups.get(monthKey)!;
      weekTargets.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
      monthlyTargets.push(weekTargets);
    }

    // console.log(`Organized into ${monthlyTargets.length} months`);
    return monthlyTargets;
  }
}