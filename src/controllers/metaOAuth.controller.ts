import { Request, Response } from 'express';
import { MetaOAuthService } from '../services/metaOAuth/service/service.js';
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
   * Note: No authentication required - updates hardcoded client ID
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
        console.log("errorMsg--------------------------------------", errorMsg);
        const frontendUrl = config.FRONTEND_URL || 'http://localhost:8080';
        console.log("frontendUrl--------------------------------------", frontendUrl);
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

      // Step 2: Hardcoded client IDs - no authentication required
      const hardcodedClientIds = [
        '683acb7561f26ee98f5d2d51',
        '68ac6ebce46631727500499b'
      ];

      // Step 3: Complete OAuth flow (exchange code, get long-lived token, store for all client IDs)
      await Promise.all(
        hardcodedClientIds.map(clientId => 
          this.metaOAuthService.completeOAuthFlow(clientId, code)
        )
      );

      // Step 4: Redirect to frontend with success (this is the redirect AFTER getting the token)
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

