import { Request, Response } from 'express';
import { MetaOAuthService } from '../services/metaOAuth/service/service.js';
import { verifyToken } from '../services/auth/utils/token.js';
import { config } from '../config.js';
import { CustomError, ErrorCode } from '../pkg/error/custom_error.js';

class MetaOAuthController {
  private metaOAuthService: MetaOAuthService;

  constructor() {
    this.metaOAuthService = new MetaOAuthService();
  }

  /**
   * Handle Meta OAuth callback
   * GET /api/v1/generate-meta-access-token/
   */
  generateMetaAccessToken = async (req: Request, res: Response): Promise<void> => {
    try {
      // Step 1: Extract code and error from query parameters
      const { code, error, error_description } = req.query;

      // Handle OAuth errors from Facebook
      if (error) {
        const errorMsg = error_description 
          ? `${error}: ${error_description}` 
          : error;
        const frontendUrl = config.FRONTEND_URL || 'http://localhost:8080';
        return res.redirect(
          `${frontendUrl}/profile?meta_error=${encodeURIComponent(errorMsg as string)}`
        );
      }

      // Validate code is present
      if (!code || typeof code !== 'string') {
        const frontendUrl = config.FRONTEND_URL || 'http://localhost:8080';
        return res.redirect(
          `${frontendUrl}/profile?meta_error=${encodeURIComponent('no_code: Authorization code not provided')}`
        );
      }

      // Step 2: Get authenticated user from headers
      const accessToken = req.headers.accesstoken as string;
      const refreshToken = req.headers.refreshtoken as string;

      if (!accessToken || !refreshToken) {
        const frontendUrl = config.FRONTEND_URL || 'http://localhost:8080';
        return res.redirect(
          `${frontendUrl}/profile?meta_error=${encodeURIComponent('unauthorized: User authentication tokens are missing')}`
        );
      }

      // Step 3: Verify user authentication
      let user;
      try {
        const tokenResult = await verifyToken(accessToken, refreshToken);
        if (!tokenResult.valid || !tokenResult.user) {
          throw new CustomError(ErrorCode.UNAUTHORIZED, {
            message: 'User not authenticated',
            status: 401,
          });
        }
        user = tokenResult.user;
      } catch (error: any) {
        const frontendUrl = config.FRONTEND_URL || 'http://localhost:8080';
        const errorMsg = error instanceof CustomError 
          ? error.message 
          : 'Invalid token';
        return res.redirect(
          `${frontendUrl}/profile?meta_error=${encodeURIComponent(`invalid_token: ${errorMsg}`)}`
        );
      }

      // Step 4: Complete OAuth flow (exchange code, get long-lived token, store)
      await this.metaOAuthService.completeOAuthFlow(user._id.toString(), code);

      // Step 5: Redirect to frontend with success (this is the redirect AFTER getting the token)
      const frontendUrl = config.FRONTEND_URL || 'http://localhost:8080';
      return res.redirect(`${frontendUrl}/profile?meta_success=true`);

    } catch (error: any) {
      console.error('Error in generate-meta-access-token:', error);
      const frontendUrl = config.FRONTEND_URL || 'http://localhost:8080';
      const errorMsg = error instanceof CustomError 
        ? error.message 
        : error.message || 'Unknown error occurred';
      return res.redirect(
        `${frontendUrl}/profile?meta_error=${encodeURIComponent(errorMsg)}`
      );
    }
  };
}

export default new MetaOAuthController();

