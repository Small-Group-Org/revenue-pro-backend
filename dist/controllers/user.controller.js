import UserService from "../services/user/service/service.js";
import utils from "../utils/utils.js";
class UserController {
    constructor() {
        this.getProfile = async (req, res) => {
            try {
                // Use the ID from route params (req.params.id) if provided
                // Otherwise fall back to authenticated user's ID for backward compatibility
                const userId = req.params.id || req.context.getUserId();
                if (!userId) {
                    utils.sendErrorResponse(res, "User ID is required");
                    return;
                }
                const user = await this.userService.getUserById(userId);
                if (!user) {
                    utils.sendErrorResponse(res, "User not found");
                    return;
                }
                utils.sendSuccessResponse(res, 200, {
                    success: true,
                    data: {
                        id: user._id,
                        email: user.email,
                        name: user.name,
                        role: user.role,
                        imageURL: user.imageURL,
                        isEmailVerified: user.isEmailVerified,
                        hasLoggedIn: user.hasLoggedIn,
                        hasSeenLatestUpdate: user.hasSeenLatestUpdate,
                        fbAdAccountId: user.fbAdAccountId,
                        fbPixelId: user.fbPixelId,
                        metaAccessToken: user.metaAccessToken,
                    },
                });
            }
            catch (error) {
                utils.sendErrorResponse(res, error);
            }
        };
        this.updateProfile = async (req, res) => {
            try {
                const userId = req.context.getUserId();
                const { name, email, role, isEmailVerified } = req.body;
                const updatedUser = await this.userService.updateUserDetails(userId, {
                    name,
                    email,
                    role,
                    isEmailVerified
                });
                if (!updatedUser) {
                    utils.sendErrorResponse(res, "User not found");
                    return;
                }
                utils.sendSuccessResponse(res, 200, {
                    success: true,
                    message: "Profile updated successfully",
                    data: {
                        id: updatedUser._id,
                        email: updatedUser.email,
                        name: updatedUser.name,
                        role: updatedUser.role,
                        imageURL: updatedUser.imageURL,
                        isEmailVerified: updatedUser.isEmailVerified,
                    },
                });
            }
            catch (error) {
                utils.sendErrorResponse(res, error);
            }
        };
        this.updatePassword = async (req, res) => {
            try {
                const { userId, newPassword } = req.body;
                if (!userId || !newPassword) {
                    utils.sendErrorResponse(res, "userId and newPassword are required");
                    return;
                }
                await this.userService.updateUserPassword(userId, newPassword);
                utils.sendSuccessResponse(res, 200, {
                    success: true,
                    message: "Password updated successfully",
                });
            }
            catch (error) {
                utils.sendErrorResponse(res, error);
            }
        };
        this.updateLastAccess = async (req, res) => {
            try {
                const userId = req.context.getUserId();
                const updatedUser = await this.userService.updateLastAccessAt(userId);
                utils.sendSuccessResponse(res, 200, {
                    success: true,
                    message: "Last access time updated successfully",
                    data: {
                        id: updatedUser._id,
                        lastAccessAt: updatedUser.lastAccessAt,
                    },
                });
            }
            catch (error) {
                utils.sendErrorResponse(res, error);
            }
        };
        this.markUpdateAsSeen = async (req, res) => {
            try {
                const userId = req.context.getUserId();
                const updatedUser = await this.userService.markUpdateAsSeen(userId);
                utils.sendSuccessResponse(res, 200, {
                    success: true,
                    message: "Update marked as seen successfully",
                    data: {
                        id: updatedUser._id,
                        hasSeenLatestUpdate: updatedUser.hasSeenLatestUpdate,
                    },
                });
            }
            catch (error) {
                utils.sendErrorResponse(res, error);
            }
        };
        this.updateFbAdAccountId = async (req, res) => {
            try {
                const clientId = req.params.clientId;
                const { fbAdAccountId, fbPixelId, fbPixelToken } = req.body;
                if (!clientId) {
                    utils.sendErrorResponse(res, "clientId is required in route params");
                    return;
                }
                if (!fbAdAccountId) {
                    utils.sendErrorResponse(res, "fbAdAccountId is required in request body");
                    return;
                }
                // Validate ad account ID format (should be numeric or act_XXXXX)
                const isValid = /^(act_)?\d+$/.test(fbAdAccountId);
                if (!isValid) {
                    utils.sendErrorResponse(res, "Invalid ad account ID format. Should be numeric or act_XXXXX");
                    return;
                }
                // Validate pixel ID format if provided (should be numeric)
                if (fbPixelId) {
                    const isValidPixelId = /^\d+$/.test(fbPixelId);
                    if (!isValidPixelId) {
                        utils.sendErrorResponse(res, "Invalid pixel ID format. Should be numeric");
                        return;
                    }
                }
                // If fbPixelId is provided, fbPixelToken must also be provided
                if (fbPixelId && !fbPixelToken) {
                    utils.sendErrorResponse(res, "fbPixelToken is required when fbPixelId is provided");
                    return;
                }
                if (fbPixelToken && !fbPixelId) {
                    utils.sendErrorResponse(res, "fbPixelId is required when fbPixelToken is provided");
                    return;
                }
                const updatedUser = await this.userService.updateFbAdAccountId(clientId, fbAdAccountId, fbPixelId, fbPixelToken);
                if (!updatedUser) {
                    utils.sendErrorResponse(res, "User not found");
                    return;
                }
                utils.sendSuccessResponse(res, 200, {
                    success: true,
                    message: "Facebook credentials updated successfully",
                    data: {
                        id: updatedUser._id,
                        fbAdAccountId: updatedUser.fbAdAccountId,
                        fbPixelId: updatedUser.fbPixelId,
                    },
                });
            }
            catch (error) {
                utils.sendErrorResponse(res, error);
            }
        };
        this.userService = new UserService();
    }
}
export default new UserController();
