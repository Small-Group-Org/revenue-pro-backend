export interface IReportResult {
    timeframe: string;
    dateRange: { startDate: Date; endDate: Date };
    targets: object;
    actuals: object;
    performance: object;
  }