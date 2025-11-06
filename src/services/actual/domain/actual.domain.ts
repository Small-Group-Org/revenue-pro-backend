import { IAdNamesAmount } from "../repository/models/actual.model.js";

export interface IMonthlyActual {
  month: number;
  testingBudgetSpent: number;
  awarenessBrandingBudgetSpent: number;
  leadGenerationBudgetSpent: number;
  revenue: number;
  sales: number; // renamed from jobsBooked
  leads: number; // new field
  estimatesRan: number;
  estimatesSet: number;
  adNamesAmount: IAdNamesAmount[]; // new field: array of ad names with their budgets
}

export interface IActual {
  year: number;
  monthly: IMonthlyActual[];
  totalTestingBudget: number;
  totalBrandingBudget: number;
  totalLeadGenBudget: number;
  totalRevenue: number;
  totalSales: number; // renamed from totalJobsBooked
  totalEstimatesRan: number;
  totalEstimatesSet: number;
}

export interface IWeeklyActual {
  userId: string;
  startDate: string;
  endDate: string;
  testingBudgetSpent: number;
  awarenessBrandingBudgetSpent: number;
  leadGenerationBudgetSpent: number;
  revenue: number;
  sales: number; // renamed from jobsBooked
  leads: number; // new field
  estimatesRan: number;
  estimatesSet: number;
  adNamesAmount: IAdNamesAmount[]; // new field: array of ad names with their budgets
}

export interface IActualQuery {
  userId: string;
  startDate: Date;
  endDate: Date;
}

export interface IWeeklyActualDocument extends IWeeklyActual, Document {}
