export interface IMonthlyTarget {
    month: number;
    leads: number;
    revenue: number;
    avgJobSize: number;
  }
  
  export interface ITarget {
    year: number;
    appointmentRate: number;
    showRate: number;
    closeRate: number;
    monthly: IMonthlyTarget[];
    adSpendBudget: number;
    costPerLead: number;
    costPerEstimateSet: number;
    costPerJobBooked: number;
  }