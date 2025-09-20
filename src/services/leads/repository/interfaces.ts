import { ILead, ILeadDocument } from '../domain/leads.domain.js';
import { IConversionRate, IConversionRateDocument } from './models/conversionRate.model.js';

// Lead Repository Interface
export interface ILeadRepository {
  // Basic CRUD operations
  createLead(data: ILead): Promise<ILeadDocument>;
  updateLead(
    queryOrId: string | Partial<Pick<ILeadDocument, "clientId" | "adSetName" | "email" | "phone" | "service" | "adName" | "zip">>,
    update: Partial<ILead>
  ): Promise<ILeadDocument | null>;
  deleteLead(id: string): Promise<ILeadDocument | null>;
  
  // Query operations
  getLeadById(id: string): Promise<ILeadDocument | null>;
  getLeads(filter?: Partial<ILead>): Promise<ILeadDocument[]>;
  getLeadsByClientId(clientId: string): Promise<Partial<ILead>[]>;
  getLeadsByDateRange(start: string, end: string): Promise<ILeadDocument[]>;
  findLeads(query?: Partial<ILead>): Promise<Partial<ILead>[]>;
  getSortedLeads(query?: Partial<ILead>): Promise<Partial<ILead>[]>;
  
  // Bulk operations
  insertMany(leads: ILead[]): Promise<ILeadDocument[]>;
  bulkWriteLeads(
    bulkOps: Parameters<any>[0],
    options?: Parameters<any>[1]
  ): Promise<any>;
  bulkDeleteLeads(ids: string[]): Promise<{ modifiedCount: number }>;
  updateManyLeads(query: Partial<ILead>, update: any): Promise<any>;
  
  // Utility operations
  existsByClientId(clientId: string): Promise<boolean>;
  getDistinctClientIds(): Promise<string[]>;
  
  // Upsert operation
  upsertLead(
    query: Partial<Pick<ILeadDocument, "clientId" | "adSetName" | "email" | "phone" | "service" | "adName" | "zip">>,
    leadPayload: Partial<ILead>
  ): Promise<ILeadDocument>;
}

// Conversion Rate Repository Interface
export interface IConversionRateRepository {
  // Basic CRUD operations
  createConversionRate(data: IConversionRate): Promise<IConversionRateDocument>;
  updateConversionRate(id: string, update: Partial<IConversionRate>): Promise<IConversionRateDocument | null>;
  deleteConversionRate(id: string): Promise<IConversionRateDocument | null>;
  
  // Query operations
  getConversionRateById(id: string): Promise<IConversionRateDocument | null>;
  getConversionRates(filter?: Partial<IConversionRate>): Promise<IConversionRateDocument[]>;
  
  // Bulk operations
  insertMany(conversionRates: IConversionRate[]): Promise<IConversionRateDocument[]>;
  batchUpsertConversionRates(conversionRates: IConversionRate[]): Promise<{
    documents: IConversionRateDocument[];
    stats: {
      total: number;
      newInserts: number;
      updated: number;
    };
  }>;
  
  // Upsert operation
  upsertConversionRate(data: IConversionRate): Promise<IConversionRateDocument>;
}

// Lead Aggregation Repository Interface (for complex queries)
export interface ILeadAggregationRepository {
  // Pagination and filtering
  findLeadsWithCount(options: {
    query?: Partial<ILead>;
    sortField?: string;
    sortOrder?: 1 | -1;
    skip?: number;
    limit?: number;
  }): Promise<{ totalCount: number; leads: Partial<ILead>[] }>;
  
  // Filter options and statistics
  getLeadFilterOptionsAndStats(query: any): Promise<{
    services: string[];
    adSetNames: string[];
    adNames: string[];
    statuses: string[];
    unqualifiedLeadReasons: string[];
    statusAgg: { _id: string; count: number }[];
  }>;
  
  // Performance analytics
  getAdSetPerformance(
    query: any, 
    page: number, 
    limit: number, 
    sortOptions?: any
  ): Promise<{ totalCount: number; data: any[] }>;
  
  getAdNamePerformance(
    query: any, 
    page: number, 
    limit: number, 
    sortOptions?: any
  ): Promise<{ totalCount: number; data: any[] }>;
}
