import { ReportService } from "../services/reports/service/service.js";
import { ActualService } from "../services/actual/service/service.js";
import { TargetService } from "../services/target/service/service.js";
import AuthService from "../services/auth/service/service.js";
import UserService from "../services/user/service/service.js";
import IPTrackingService from "../services/ipTracking/service/service.js";
import IPTrackingRepository from "../services/ipTracking/repository/repository.js";
// Import new lead services
import { LeadService, LeadAnalyticsService, LeadScoringService, CombinedLeadService } from "../services/leads/service/index.js";
class di {
    ReportService() {
        if (!this.reportService) {
            return (this.reportService = new ReportService());
        }
        return this.reportService;
    }
    ActualService() {
        if (!this.actualService) {
            return (this.actualService = new ActualService());
        }
        return this.actualService;
    }
    TargetService() {
        if (!this.targetService) {
            return (this.targetService = new TargetService());
        }
        return this.targetService;
    }
    UserService() {
        if (!this.userService) {
            return (this.userService = new UserService());
        }
        return this.userService;
    }
    AuthService() {
        if (!this.authService) {
            return (this.authService = new AuthService(this.UserService()));
        }
        return this.authService;
    }
    IPTrackingRepository() {
        if (!this.ipTrackingRepository) {
            return (this.ipTrackingRepository = new IPTrackingRepository());
        }
        return this.ipTrackingRepository;
    }
    IPTrackingService() {
        if (!this.ipTrackingService) {
            return (this.ipTrackingService = new IPTrackingService(this.IPTrackingRepository(), this.UserService()));
        }
        return this.ipTrackingService;
    }
    // Lead services
    LeadService() {
        if (!this.leadService) {
            return (this.leadService = new LeadService());
        }
        return this.leadService;
    }
    LeadAnalyticsService() {
        if (!this.leadAnalyticsService) {
            return (this.leadAnalyticsService = new LeadAnalyticsService());
        }
        return this.leadAnalyticsService;
    }
    LeadScoringService() {
        if (!this.leadScoringService) {
            return (this.leadScoringService = new LeadScoringService());
        }
        return this.leadScoringService;
    }
    CombinedLeadService() {
        if (!this.combinedLeadService) {
            return (this.combinedLeadService = new CombinedLeadService(this.LeadService(), this.LeadAnalyticsService(), this.LeadScoringService()));
        }
        return this.combinedLeadService;
    }
}
export default new di();
