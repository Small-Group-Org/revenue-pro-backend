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
    constructor(leadSvc, analyticsSvc, scoringSvc) {
        this.leadService = leadSvc || new LeadService();
        this.analyticsService = analyticsSvc || new LeadAnalyticsService();
        this.scoringService = scoringSvc || new LeadScoringService();
    }
    // Delegate CRUD operations to LeadService
    async updateLead(id, data) { return this.leadService.updateLead(id, data); }
    async deleteLeads(ids) { return this.leadService.deleteLeads(ids); }
    async upsertLead(query, payload) { return this.leadService.upsertLead(query, payload); }
    async findAndUpdateLeadByEmail(params) {
        return this.leadService.findAndUpdateLeadByEmail(params);
    }
    async bulkCreateLeads(payloads, uniquenessByPhoneEmail) {
        return this.leadService.bulkCreateLeads(payloads, uniquenessByPhoneEmail);
    }
    async getLeadsPaginated(clientId, startDate, endDate, pagination, filters) {
        return this.leadService.getLeadsPaginated(clientId, startDate, endDate, pagination, filters);
    }
    async fetchLeadFiltersAndCounts(clientId, startDate, endDate) {
        return this.leadService.fetchLeadFiltersAndCounts(clientId, startDate, endDate);
    }
    async doesUserExist(clientId) { return this.leadService.doesUserExist(clientId); }
    async hasLeadData(clientId) { return this.leadService.hasLeadData(clientId); }
    async getAllClientIds() { return this.leadService.getAllClientIds(); }
    async getAllLeadsForClient(clientId) { return this.leadService.getAllLeadsForClient(clientId); }
    async getClientActivityData() { return this.leadService.getClientActivityData(); }
    // Delegate analytics operations to LeadAnalyticsService
    async getLeadAnalytics(clientId, startDate, endDate, sort) {
        return this.analyticsService.getLeadAnalytics(clientId, startDate, endDate, sort);
    }
    async getPerformanceTables(clientId, startDate, endDate, adSetPage, adNamePage, adSetItemsPerPage, adNameItemsPerPage, sortOptions) {
        return this.analyticsService.getPerformanceTables(clientId, startDate, endDate, adSetPage, adNamePage, adSetItemsPerPage, adNameItemsPerPage, sortOptions);
    }
    async getAggregatedLeadAnalytics(startDate, endDate) {
        return this.analyticsService.getAggregatedLeadAnalytics(startDate, endDate);
    }
    // Delegate scoring operations to LeadScoringService
    async processLeadScoresAndCRsByClientId(clientId) {
        return this.scoringService.processLeadScoresAndCRsByClientId(clientId);
    }
    async recalculateAllLeadScores(clientId) {
        return this.scoringService.recalculateAllLeadScores(clientId);
    }
    computeConversionRatesForClient(leads, clientId) {
        return this.scoringService.computeConversionRatesForClient(leads, clientId);
    }
}
// Export combined service instance for backward compatibility
export const combinedLeadService = new CombinedLeadService();
