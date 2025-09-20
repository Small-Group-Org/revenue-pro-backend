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
  private reportService: ReportService | undefined;
  private actualService: ActualService | undefined;
  private targetService: TargetService | undefined;
  private userService: UserService | undefined;
  private authService: AuthService | undefined;
  private ipTrackingService: IPTrackingService | undefined;
  private ipTrackingRepository: IPTrackingRepository | undefined;
  
  // Lead services
  private leadService: LeadService | undefined;
  private leadAnalyticsService: LeadAnalyticsService | undefined;
  private leadScoringService: LeadScoringService | undefined;
  private combinedLeadService: CombinedLeadService | undefined;

  public ReportService(): ReportService {
    if (!this.reportService) {
      return (this.reportService = new ReportService());
    }
    return this.reportService;
  }

  public ActualService(): ActualService {
    if (!this.actualService) {
      return (this.actualService = new ActualService());
    }
    return this.actualService;
  }

  public TargetService(): TargetService {
    if (!this.targetService) {
      return (this.targetService = new TargetService());
    }
    return this.targetService;
  }

  public UserService(): UserService {
    if (!this.userService) {
      return (this.userService = new UserService());
    }
    return this.userService;
  }

  public AuthService(): AuthService {
    if (!this.authService) {
      return (this.authService = new AuthService(this.UserService()));
    }
    return this.authService;
  }

  public IPTrackingRepository(): IPTrackingRepository {
    if (!this.ipTrackingRepository) {
      return (this.ipTrackingRepository = new IPTrackingRepository());
    }
    return this.ipTrackingRepository;
  }

  public IPTrackingService(): IPTrackingService {
    if (!this.ipTrackingService) {
      return (this.ipTrackingService = new IPTrackingService(this.IPTrackingRepository(), this.UserService()));
    }
    return this.ipTrackingService;
  }

  // Lead services
  public LeadService(): LeadService {
    if (!this.leadService) {
      return (this.leadService = new LeadService());
    }
    return this.leadService;
  }

  public LeadAnalyticsService(): LeadAnalyticsService {
    if (!this.leadAnalyticsService) {
      return (this.leadAnalyticsService = new LeadAnalyticsService());
    }
    return this.leadAnalyticsService;
  }

  public LeadScoringService(): LeadScoringService {
    if (!this.leadScoringService) {
      return (this.leadScoringService = new LeadScoringService());
    }
    return this.leadScoringService;
  }

  public CombinedLeadService(): CombinedLeadService {
    if (!this.combinedLeadService) {
      return (this.combinedLeadService = new CombinedLeadService(
        this.LeadService(),
        this.LeadAnalyticsService(),
        this.LeadScoringService()
      ));
    }
    return this.combinedLeadService;
  }
}

export default new di();
