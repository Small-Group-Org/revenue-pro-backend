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
    current.setDate(current.getDate() - ((current.getDay() + 6) % 7)); // move to Monday

    // Continue until we've covered the entire month
    while (current <= endDate) {
      const weekStart = new Date(current);
      const weekEnd = new Date(current);
      weekEnd.setDate(weekStart.getDate() + 6);

      result.push({
        year: weekStart.getFullYear(),
        weekNumber: this.getISOWeekNumber(weekStart),
        weekStart: weekStart.toISOString().split("T")[0],
        weekEnd: weekEnd.toISOString().split("T")[0],
      });

      current.setDate(current.getDate() + 7); // move to next Monday
    }

    return result;
  }

  // Test function to verify getMonthWeeks works
  static testGetMonthWeeks() {
    console.log("=== Testing getMonthWeeks ===");
    
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
}
