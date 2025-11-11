import { Request, Response } from "express";
import ghlClientService from "../services/ghlClient/service/service.js";
import utils from "../utils/utils.js";
import { CustomError, ErrorCode } from "../pkg/error/custom_error.js";
import { IGhlClient } from "../services/ghlClient/domain/ghlClient.domain.js";

class GhlClientController {
  private ghlClientService = ghlClientService;

  /**
   * POST /api/v1/ghl-clients
   * Create a new GHL client configuration
   * Body: { locationId, ghlApiToken, queryValue }
   * RevenuePro client ID is extracted from the authenticated user's token
   */
  public createGhlClient = async (req: Request, res: Response): Promise<void> => {
    try {
      const { locationId, ghlApiToken, queryValue, revenueProClientId } = req.body;

      // Validate required fields
      if (!locationId || !ghlApiToken || !queryValue || !revenueProClientId) {
        utils.sendErrorResponse(
          res,
          new CustomError(ErrorCode.BAD_REQUEST, "Missing required fields: locationId, ghlApiToken, queryValue, and revenueProClientId are required")
        );
        return;
      }

      const ghlClient = await this.ghlClientService.createGhlClient(
        locationId,
        ghlApiToken,
        queryValue,
        revenueProClientId
      );

      utils.sendSuccessResponse(res, 201, {
        success: true,
        message: "GHL client configuration created successfully",
        data: {
          id: ghlClient._id,
          locationId: ghlClient.locationId,
          queryValue: ghlClient.queryValue,
          customFieldId: ghlClient.customFieldId,
          revenueProClientId: ghlClient.revenueProClientId,
          status: ghlClient.status,
          createdAt: ghlClient.created_at,
        },
      });
    } catch (error: any) {
      // Handle duplicate locationId error
      if (error.message?.includes("already exists")) {
        utils.sendErrorResponse(res, new CustomError(ErrorCode.CONFLICT, error.message));
        return;
      }
      utils.sendErrorResponse(res, error);
    }
  };

  /**
   * GET /api/v1/ghl-clients
   * Get all active GHL client configurations
   */
  public getAllGhlClients = async (req: Request, res: Response): Promise<void> => {
    try {
      const clients = await this.ghlClientService.getAllActiveGhlClients();

      // Return clients without encrypted tokens
      const clientsData = clients.map((client: IGhlClient) => ({
        id: client._id,
        locationId: client.locationId,
        queryValue: client.queryValue,
        customFieldId: client.customFieldId,
        revenueProClientId: client.revenueProClientId,
        status: client.status,
        createdAt: client.created_at,
        updatedAt: client.updated_at,
      }));

      utils.sendSuccessResponse(res, 200, {
        success: true,
        data: clientsData,
      });
    } catch (error) {
      utils.sendErrorResponse(res, error);
    }
  };

  /**
   * GET /api/v1/ghl-clients/:locationId
   * Get a specific GHL client configuration by locationId (with decrypted token)
   */
  public getGhlClientById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { locationId } = req.params;
      const client = await this.ghlClientService.getGhlClientByLocationId(locationId);

      if (!client) {
        utils.sendErrorResponse(res, new CustomError(ErrorCode.NOT_FOUND, "GHL client not found"));
        return;
      }

      // Decrypt the API token for the response
      const decryptedToken = this.ghlClientService.getDecryptedApiToken(client);

      utils.sendSuccessResponse(res, 200, {
        success: true,
        data: {
          id: client._id,
          locationId: client.locationId,
          ghlApiToken: decryptedToken,
          queryValue: client.queryValue,
          customFieldId: client.customFieldId,
          revenueProClientId: client.revenueProClientId,
          status: client.status,
          createdAt: client.created_at,
          updatedAt: client.updated_at,
        },
      });
    } catch (error) {
      utils.sendErrorResponse(res, error);
    }
  };
}

export default new GhlClientController();

