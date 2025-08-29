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

export interface IWeeklyTarget {
  userId: string;
  startDate: string;
  endDate: string;
  year: number;
  weekNumber: number;
  appointmentRate: number;
  avgJobSize: number;
  closeRate: number;
  com: number;
  revenue: number;
  showRate: number;
  queryType: string;
  managementCost: number;
}

export interface ITargetQuery {
  userId: string;
  startDate: Date;
  endDate: Date;
}