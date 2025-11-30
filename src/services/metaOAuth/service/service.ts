import axios from 'axios';
import { config } from '../../../config.js';
import { CustomError, ErrorCode } from '../../../pkg/error/custom_error.js';
import di from '../../../di/di.js';
import utils from '../../../utils/utils.js';

interface TokenData {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}

export class MetaOAuthService {
  /**
   * Exchange authorization code for short-lived access token
   */
  async exchangeCodeForToken(code: string): Promise<TokenData> {
    try {
      const response = await axios.post(
        `https://graph.facebook.com/${config.META_API_VERSION}/oauth/access_token`,
        null,
        {
          params: {
            client_id: config.META_CLIENT_ID,
            client_secret: config.META_CLIENT_SECRET,
            redirect_uri: config.META_REDIRECT_URI,
            code: code,
          },
        }
      );

      if (!response.data.access_token) {
        throw new CustomError(ErrorCode.INTERNAL_SERVER_ERROR, {
          message: 'Failed to get access token from Meta',
          status: 500,
        });
      }

      return {
        accessToken: response.data.access_token,
        tokenType: response.data.token_type || 'bearer',
        expiresIn: response.data.expires_in || 0,
      };
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message || error.message || 'Failed to exchange code for token';
      throw new CustomError(ErrorCode.INTERNAL_SERVER_ERROR, {
        message: errorMessage,
        status: error.response?.status || 500,
      });
    }
  }

  /**
   * Exchange short-lived token for long-lived token (60 days)
   */
  async getLongLivedToken(shortLivedToken: string): Promise<TokenData> {
    try {
      const response = await axios.get(
        `https://graph.facebook.com/${config.META_API_VERSION}/oauth/access_token`,
        {
          params: {
            grant_type: 'fb_exchange_token',
            client_id: config.META_CLIENT_ID,
            client_secret: config.META_CLIENT_SECRET,
            fb_exchange_token: shortLivedToken,
          },
        }
      );

      if (!response.data.access_token) {
        throw new CustomError(ErrorCode.INTERNAL_SERVER_ERROR, {
          message: 'Failed to get long-lived token from Meta',
          status: 500,
        });
      }

      return {
        accessToken: response.data.access_token,
        tokenType: response.data.token_type || 'bearer',
        expiresIn: response.data.expires_in || 0,
      };
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message || error.message || 'Failed to get long-lived token';
      throw new CustomError(ErrorCode.INTERNAL_SERVER_ERROR, {
        message: errorMessage,
        status: error.response?.status || 500,
      });
    }
  }

  /**
   * Store Meta access token for user
   */
  async storeMetaToken(userId: string, tokenData: TokenData): Promise<void> {
    try {
      if (!userId) {
        throw new CustomError(ErrorCode.INVALID_INPUT, {
          message: 'User ID is required',
          status: 400,
        });
      }

      const expiresAt = new Date(Date.now() + (tokenData.expiresIn * 1000));

      await di.UserService().updateUser(userId, {
        metaAccessToken: tokenData.accessToken,
        metaTokenExpiresAt: expiresAt,
        metaTokenType: tokenData.tokenType,
        metaConnectedAt: new Date(),
      });
    } catch (error) {
      throw utils.ThrowableError(error);
    }
  }

  /**
   * Complete OAuth flow: exchange code, get long-lived token, and store it
   */
  async completeOAuthFlow(userId: string, code: string): Promise<void> {
    try {
      // Step 1: Exchange code for short-lived token
      const shortLivedToken = await this.exchangeCodeForToken(code);

      // Step 2: Exchange for long-lived token (recommended for production)
      const longLivedToken = await this.getLongLivedToken(shortLivedToken.accessToken);

      // Step 3: Store the long-lived token
      await this.storeMetaToken(userId, longLivedToken);
    } catch (error) {
      throw utils.ThrowableError(error);
    }
  }
}

