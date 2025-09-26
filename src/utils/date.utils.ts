import {
  startOfWeek,
  endOfWeek,
  getISOWeek,
  startOfMonth,
  endOfMonth,
  eachWeekOfInterval,
  isSameMonth,
  addDays,
} from "date-fns";

export interface IWeekInfo {
  year: number;
  weekNumber: number;
  startDate: Date;
  endDate: Date;
}

type WeekRange = {
  year: number;
  weekNumber: number;
  weekStart: string;
  weekEnd: string;
};

export class DateUtils {
  static getWeekDetails(dateStr: string): WeekRange {
    const inputDate = new Date(dateStr);

    // Move to Monday of that week
    const monday = new Date(inputDate);
    const day = inputDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const diffToMonday = (day + 6) % 7;
    monday.setDate(inputDate.getDate() - diffToMonday);

    // Calculate week start and end
    const weekStart = new Date(monday);
    const weekEnd = new Date(monday);
    weekEnd.setDate(weekStart.getDate() + 6);

    return {
      year: weekStart.getFullYear(),
      weekNumber: this.getISOWeekNumber(weekStart),
      weekStart: weekStart.toISOString().split("T")[0],
      weekEnd: weekEnd.toISOString().split("T")[0],
    };
  }

  static getISOWeekNumber(date: Date): number {
    const temp = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
    );
    const day = temp.getUTCDay() || 7; // Make Sunday (0) become 7
    temp.setUTCDate(temp.getUTCDate() + 4 - day); // nearest Thursday
    const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((+temp - +yearStart) / 86400000 + 1) / 7);
    return weekNo;
  }

  static getMonthWeeks(startDateStr: string, endDateStr: string): WeekRange[] {
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);

    const result: WeekRange[] = [];
    
    // Start from the beginning of the week containing startDate
    const current = new Date(startDate);
    current.setDate(current.getDate() - ((current.getDay() + 6) % 7)); // move to first Monday

    // Continue until we've covered the entire month range
    while (current <= endDate) {
      const weekStart = new Date(current);
      const weekEnd = new Date(current);
      weekEnd.setDate(weekStart.getDate() + 6);

      // Count how many days of this week fall within the month range
      const daysInMonth = this.countDaysInRange(weekStart, weekEnd, startDate, endDate);
      
      // Only include the week if more than 3 days belong to the month
      if (daysInMonth > 3) {
        result.push({
          year: weekStart.getFullYear(),
          weekNumber: this.getISOWeekNumber(weekStart),
          weekStart: weekStart.toISOString().split("T")[0],
          weekEnd: weekEnd.toISOString().split("T")[0],
        });
      }

      current.setDate(current.getDate() + 7); // move to next Monday
    }

    return result;
  }

  // Helper function to count days in a week that fall within the month range
  private static countDaysInRange(weekStart: Date, weekEnd: Date, monthStart: Date, monthEnd: Date): number {
    const rangeStart = weekStart > monthStart ? weekStart : monthStart;
    const rangeEnd = weekEnd < monthEnd ? weekEnd : monthEnd;
    
    if (rangeStart > rangeEnd) {
      return 0; // No overlap
    }
    
    // Calculate the number of days (inclusive)
    const timeDiff = rangeEnd.getTime() - rangeStart.getTime();
    const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24)) + 1;
    
    return daysDiff;
  }

  // Test function to verify getMonthWeeks works
  static testGetMonthWeeks() {    
    const testCases = [
      { start: "2025-01-01", end: "2025-01-31" },
      { start: "2025-02-01", end: "2025-02-28" },
      { start: "2025-03-01", end: "2025-03-31" }
    ];
    
    testCases.forEach(({ start, end }) => {
      const weeks = this.getMonthWeeks(start, end);
      console.log(`${start} to ${end}: ${weeks.length} weeks`);
      console.log(weeks);
    });
  }

  static getYearWeeks(year: number): WeekRange[] {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    return this.getMonthWeeks(start.toISOString(), end.toISOString());
  }

  /**
   * Get weeks for a month range with proper week boundary logic.
   * A week is included in a month if the majority of its days fall in that month.
   * 
   * @param startDateStr Start date (e.g., "2025-06-01")
   * @param endDateStr End date (e.g., "2025-07-31")
   * @returns Array of weeks that belong to the specified month range
   */
  static getProperMonthWeeks(startDateStr: string, endDateStr: string): WeekRange[] {
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    
    console.log(`=== getProperMonthWeeks ===`);
    console.log(`Input range: ${startDateStr} to ${endDateStr}`);
    
    const result: WeekRange[] = [];
    
    // Get all weeks that overlap with the date range
    const allWeeks = this.getMonthWeeks(startDateStr, endDateStr);
    
    console.log(`Found ${allWeeks.length} overlapping weeks`);
    
    for (const week of allWeeks) {
      const weekStart = new Date(week.weekStart);
      const weekEnd = new Date(week.weekEnd);
      
      // Check if this is a yearly query (full year)
      const isYearlyQuery = startDate.getMonth() === 0 && startDate.getDate() === 1 && 
                           endDate.getMonth() === 11 && endDate.getDate() === 31 &&
                           startDate.getFullYear() === endDate.getFullYear();
      
      if (isYearlyQuery) {
        // For yearly queries, include any week that has days in the requested year
        const weekStart = new Date(week.weekStart);
        const weekEnd = new Date(week.weekEnd);
        const targetYear = startDate.getFullYear();
        
        // Check if any day in this week falls in the target year
        let hasDaysInTargetYear = false;
        const currentDate = new Date(weekStart);
        
        while (currentDate <= weekEnd) {
          if (currentDate.getFullYear() === targetYear) {
            hasDaysInTargetYear = true;
            break;
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }
        
        if (hasDaysInTargetYear) {
          result.push(week);
          console.log(`✓ Including week for yearly query: ${week.weekStart} to ${week.weekEnd} (has days in ${targetYear})`);
        } else {
          console.log(`✗ Excluding week for yearly query: ${week.weekStart} to ${week.weekEnd} (no days in ${targetYear})`);
        }
      } else {
        // For monthly/weekly queries, use the original logic
        // Count days in each month for this week
        let daysInStartMonth = 0;
        let daysInEndMonth = 0;
        let daysInOtherMonths = 0;
        
        const currentDate = new Date(weekStart);
        while (currentDate <= weekEnd) {
          const currentMonth = currentDate.getMonth();
          const currentYear = currentDate.getFullYear();
          
          if (currentYear === startDate.getFullYear() && currentMonth === startDate.getMonth()) {
            daysInStartMonth++;
          } else if (currentYear === endDate.getFullYear() && currentMonth === endDate.getMonth()) {
            daysInEndMonth++;
          } else {
            daysInOtherMonths++;
          }
          
          currentDate.setDate(currentDate.getDate() + 1);
        }
        
        console.log(`Week ${week.weekStart} to ${week.weekEnd}: ${daysInStartMonth} days in start month, ${daysInEndMonth} days in end month, ${daysInOtherMonths} days in other months`);
        
        // Determine if this week should be included
        let shouldInclude = false;
        
        if (startDate.getFullYear() === endDate.getFullYear() && startDate.getMonth() === endDate.getMonth()) {
          // Same month: include if majority of days are in this month
          shouldInclude = daysInStartMonth > 3; // More than half of 7 days
        } else {
          // Different months: include if majority of days are in either start or end month
          const maxDaysInRange = Math.max(daysInStartMonth, daysInEndMonth);
          shouldInclude = maxDaysInRange > 3; // More than half of 7 days
        }
        
        if (shouldInclude) {
          result.push(week);
          console.log(`✓ Including week: ${week.weekStart} to ${week.weekEnd}`);
        } else {
          console.log(`✗ Excluding week: ${week.weekStart} to ${week.weekEnd}`);
        }
      }
    }
    
    console.log(`Final result: ${result.length} weeks`);
    return result;
  }

  /**
   * Get proper date range for a query type
   * @param startDateStr Original start date
   * @param endDateStr Original end date  
   * @param queryType Query type (weekly/monthly/yearly)
   * @returns Proper date range for the query type
   */
  static getProperDateRange(startDateStr: string, endDateStr: string, queryType: string): { startDate: string, endDate: string } {
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    
    let properStartDate: Date;
    let properEndDate: Date;
    
    switch (queryType) {
      case "weekly":
        // For weekly, use the exact date range provided
        properStartDate = startDate;
        properEndDate = endDate;
        break;
      case "monthly":
        // For monthly, use start of first month to end of last month
        properStartDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        properEndDate = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);
        break;
      case "yearly":
        // For yearly, use start of first year to end of last year
        properStartDate = new Date(startDate.getFullYear(), 0, 1);
        properEndDate = new Date(endDate.getFullYear(), 11, 31);
        break;
      default:
        properStartDate = startDate;
        properEndDate = endDate;
    }
    
    return {
      startDate: properStartDate.toISOString().split('T')[0],
      endDate: properEndDate.toISOString().split('T')[0]
    };
  }
}
