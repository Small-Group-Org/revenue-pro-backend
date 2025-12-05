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
  async updateLead(id: string, data: any) { return this.leadService.updateLead(id, data); }
  async deleteLeads(ids: string[]) { return this.leadService.deleteLeads(ids); }
  async upsertLead(query: any, payload: any) { return this.leadService.upsertLead(query, payload); }
  async findAndUpdateLeadByEmail(params: any) {
    return this.leadService.findAndUpdateLeadByEmail(params);
  }
  async bulkCreateLeads(payloads: any[], uniquenessByPhoneEmail?: boolean) { 
    return this.leadService.bulkCreateLeads(payloads, uniquenessByPhoneEmail); 
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
  async getClientActivityData() { return this.leadService.getClientActivityData(); }

  // Delegate analytics operations to LeadAnalyticsService
  async getLeadAnalytics(clientId: string, startDate?: string, endDate?: string, sort?: string) { 
    return this.analyticsService.getLeadAnalytics(clientId, startDate, endDate, sort);
  }
  async getPerformanceTables(clientId: string, startDate?: string, endDate?: string, adSetPage?: number, adNamePage?: number, adSetItemsPerPage?: number, adNameItemsPerPage?: number, sortOptions?: any) { 
    return this.analyticsService.getPerformanceTables(clientId, startDate, endDate, adSetPage, adNamePage, adSetItemsPerPage, adNameItemsPerPage, sortOptions); 
  }
  async getAggregatedLeadAnalytics(startDate: string, endDate: string, queryType: "weekly" | "monthly" | "yearly") {
    return this.analyticsService.getAggregatedLeadAnalytics(startDate, endDate, queryType);
  }

  // Delegate scoring operations to LeadScoringService
  async processLeadScoresAndCRsByClientId(clientId: string) { 
    return this.scoringService.processLeadScoresAndCRsByClientId(clientId); 
  }
  async recalculateAllLeadScores(clientId: string) { 
    return this.scoringService.recalculateAllLeadScores(clientId); 
  }
  computeConversionRatesForClient(leads: any[], clientId: string) { 
    return this.scoringService.computeConversionRatesForClient(leads, clientId); 
  }
}

// Export combined service instance for backward compatibility
export const combinedLeadService = new CombinedLeadService();
