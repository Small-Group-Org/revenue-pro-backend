// Export all service classes
export { LeadService } from './LeadService.js';
export { LeadAnalyticsService } from './LeadAnalyticsService.js';
export { LeadScoringService } from './LeadScoringService.js';

// Export sheets service (keep existing)
export * from './sheets.service.js';

// Import service classes for instance creation
import { LeadService } from './LeadService.js';
import { LeadAnalyticsService } from './LeadAnalyticsService.js';
import { LeadScoringService } from './LeadScoringService.js';

// Create service instances for easy import
export const leadService = new LeadService();
export const leadAnalyticsService = new LeadAnalyticsService();
export const leadScoringService = new LeadScoringService();

// For backward compatibility - export a combined service that delegates to the new services
// This allows existing controllers to work without changes during migration
export class CombinedLeadService {
  private leadService: LeadService;
  private analyticsService: LeadAnalyticsService;
  private scoringService: LeadScoringService;

  constructor(
    leadSvc?: LeadService,
    analyticsSvc?: LeadAnalyticsService,
    scoringSvc?: LeadScoringService
  ) {
    this.leadService = leadSvc || new LeadService();
    this.analyticsService = analyticsSvc || new LeadAnalyticsService();
    this.scoringService = scoringSvc || new LeadScoringService();
  }

  // Delegate CRUD operations to LeadService
  async createLead(payload: any) { return this.leadService.createLead(payload); }
  async updateLead(id: string, data: any) { return this.leadService.updateLead(id, data); }
  async deleteLeads(ids: string[]) { return this.leadService.deleteLeads(ids); }
  async upsertLead(query: any, payload: any) { return this.leadService.upsertLead(query, payload); }
  async bulkCreateLeads(payloads: any[], uniquenessByPhoneEmail?: boolean) { 
    return this.leadService.bulkCreateLeads(payloads, uniquenessByPhoneEmail); 
  }
  async getLeads(clientId?: string, startDate?: string, endDate?: string) { 
    return this.leadService.getLeads(clientId, startDate, endDate); 
  }
  async getLeadsPaginated(clientId?: string, startDate?: string, endDate?: string, pagination?: any, filters?: any) { 
    return this.leadService.getLeadsPaginated(clientId, startDate, endDate, pagination, filters); 
  }
  async fetchLeadFiltersAndCounts(clientId?: string, startDate?: string, endDate?: string) { 
    return this.leadService.fetchLeadFiltersAndCounts(clientId, startDate, endDate); 
  }
  async doesUserExist(clientId: string) { return this.leadService.doesUserExist(clientId); }
  async hasLeadData(clientId: string) { return this.leadService.hasLeadData(clientId); }
  async getAllClientIds() { return this.leadService.getAllClientIds(); }
  async getAllLeadsForClient(clientId: string) { return this.leadService.getAllLeadsForClient(clientId); }

  // Delegate analytics operations to LeadAnalyticsService
  async getLeadAnalytics(clientId: string, timeFilter?: any) { 
    return this.analyticsService.getLeadAnalytics(clientId, timeFilter); 
  }
  async getPerformanceTables(clientId: string, commonTimeFilter?: any, adSetPage?: number, adNamePage?: number, adSetItemsPerPage?: number, adNameItemsPerPage?: number, sortOptions?: any) { 
    return this.analyticsService.getPerformanceTables(clientId, commonTimeFilter, adSetPage, adNamePage, adSetItemsPerPage, adNameItemsPerPage, sortOptions); 
  }

  // Delegate scoring operations to LeadScoringService
  async updateConversionRatesAndLeadScoresForClient(clientId: string) { 
    return this.scoringService.updateConversionRatesAndLeadScoresForClient(clientId); 
  }
  async recalculateAllLeadScores(clientId: string) { 
    return this.scoringService.recalculateAllLeadScores(clientId); 
  }
  processLeads(leads: any[], clientId: string) { return this.scoringService.processLeads(leads, clientId); }
  async calculateAndStoreMissingLeadScores(leads: any[], clientId: string) { 
    return this.scoringService.calculateAndStoreMissingLeadScores(leads, clientId); 
  }
}

// Export combined service instance for backward compatibility
export const combinedLeadService = new CombinedLeadService();
