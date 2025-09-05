import { ReportService } from "../services/reports/service/service.js";
import { ActualService } from "../services/actual/service/service.js";
import { TargetService } from "../services/target/service/service.js";
import AuthService from "../services/auth/service/service.js";
import UserService from "../services/user/service/service.js";
import IPTrackingService from "../services/ipTracking/service/service.js";
import IPTrackingRepository from "../services/ipTracking/repository/repository.js";

class di {
  private reportService: ReportService | undefined;
  private actualService: ActualService | undefined;
  private targetService: TargetService | undefined;
  private userService: UserService | undefined;
  private authService: AuthService | undefined;
  private ipTrackingService: IPTrackingService | undefined;
  private ipTrackingRepository: IPTrackingRepository | undefined;

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
      return (this.ipTrackingService = new IPTrackingService(this.IPTrackingRepository()));
    }
    return this.ipTrackingService;
  }
}

export default new di();
