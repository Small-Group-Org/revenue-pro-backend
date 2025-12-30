import { Context } from "../services/common/domain/context.js";
import utils from "../utils/utils.js";
class IPTrackingController {
    constructor(ipTrackingService) {
        this.ipTrackingService = ipTrackingService;
    }
    async trackActivity(req, res) {
        try {
            const context = new Context();
            const { userId } = req.body;
            if (!userId) {
                res.status(400).json({
                    success: false,
                    message: "User ID is required",
                });
                return;
            }
            const result = await this.ipTrackingService.trackUserActivity(context, req, userId);
            res.status(200).json({
                success: true,
                data: result,
                message: "Activity tracked successfully",
            });
        }
        catch (error) {
            utils.sendErrorResponse(res, error);
        }
    }
    async getUserActivity(req, res) {
        try {
            const context = new Context();
            const { userId } = req.params;
            const { limit } = req.query;
            const result = await this.ipTrackingService.getUserActivityHistory(context, userId, limit ? parseInt(limit) : 100);
            res.status(200).json({
                success: true,
                data: result,
                message: "User activity retrieved successfully",
            });
        }
        catch (error) {
            utils.sendErrorResponse(res, error);
        }
    }
}
export default IPTrackingController;
