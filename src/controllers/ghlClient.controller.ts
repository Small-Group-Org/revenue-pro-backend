import { Request, Response } from "express";
import ghlClientService from "../services/ghlClient/service/service.js";
import utils from "../utils/utils.js";
import { CustomError, ErrorCode } from "../pkg/error/custom_error.js";
import { IGhlClient } from "../services/ghlClient/domain/ghlClient.domain.js";
import logger from "../utils/logger.js";

class GhlClientController {
  private ghlClientService = ghlClientService;

  /**
   * Helper method to map GHL client domain object to response format
   * @param client - The GHL client domain object
   * @param options - Optional parameters for response customization
   * @returns Mapped client object for API response
   */
  private mapClientToResponse(
    client: IGhlClient,
    options: { includeUpdatedAt?: boolean; ghlApiToken?: string } = {}
  ) {
    const { includeUpdatedAt = false, ghlApiToken } = options;
    
    const response: any = {
      id: client._id,
      locationId: client.locationId,
      queryValue: client.queryValue,
      customFieldId: client.customFieldId,
      queryValue2: client.queryValue2,
      customFieldId2: client.customFieldId2,
      apptBookedTagDateFieldId: client.apptBookedTagDateFieldId,
      jobWonTagDateFieldId: client.jobWonTagDateFieldId,
      jobLostTagDateFieldId: client.jobLostTagDateFieldId,
      apptCompletedTagDateFieldId: client.apptCompletedTagDateFieldId,
      disqualifiedTagDateFieldId: client.disqualifiedTagDateFieldId,
      pipelineId: client.pipelineId,
      revenueProClientId: client.revenueProClientId,
      status: client.status,
      createdAt: client.created_at,
    };

    if (includeUpdatedAt) {
      response.updatedAt = client.updated_at;
    }

    if (ghlApiToken !== undefined) {
      response.ghlApiToken = ghlApiToken;
    }

    return response;
  }

  /**
   * POST /api/v1/ghl-clients
   * Create a new GHL client configuration
   * Body: { locationId, ghlApiToken, queryValue, queryValue2? }
   * RevenuePro client ID is extracted from the authenticated user's token
   */
  public createGhlClient = async (req: Request, res: Response): Promise<void> => {
    try {
      const { locationId, ghlApiToken, queryValue, queryValue2, revenueProClientId } = req.body;

      // Log all incoming values from frontend
      logger.info('[GHL Client Create] Request received', {
        locationId,
        queryValue,
        queryValue2,
        revenueProClientId,
        ghlApiTokenLength: ghlApiToken?.length || 0,
        hasGhlApiToken: !!ghlApiToken,
        bodyKeys: Object.keys(req.body),
      });

      // Validate required fields
      if (!locationId || !ghlApiToken || !queryValue || !revenueProClientId) {
        logger.warn('[GHL Client Create] Missing required fields', {
          locationId: !!locationId,
          ghlApiToken: !!ghlApiToken,
          queryValue: !!queryValue,
          revenueProClientId: !!revenueProClientId,
        });
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
        revenueProClientId,
        'active',
        queryValue2
      );

      utils.sendSuccessResponse(res, 201, {
        success: true,
        message: "GHL client configuration created successfully",
        data: this.mapClientToResponse(ghlClient),
      });
    } catch (error: any) {
      // Log the error
      logger.error('[GHL Client Create] Failed', {
        error: error.message || String(error),
        errorCode: error.code,
        locationId: req.body.locationId,
        queryValue: req.body.queryValue,
        revenueProClientId: req.body.revenueProClientId,
      });

      // Handle duplicate locationId error
      if (error.message?.includes("already exists")) {
        utils.sendErrorResponse(res, new CustomError(ErrorCode.CONFLICT, error.message));
        return;
      }

      // Handle custom field fetch failure
      if (error.message?.includes("Failed to fetch custom field ID")) {
        utils.sendErrorResponse(res, new CustomError(ErrorCode.BAD_REQUEST, error.message));
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
      const clientsData = clients.map((client: IGhlClient) =>
        this.mapClientToResponse(client, { includeUpdatedAt: true })
      );

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
        data: this.mapClientToResponse(client, {
          includeUpdatedAt: true,
          ghlApiToken: decryptedToken,
        }),
      });
    } catch (error) {
      utils.sendErrorResponse(res, error);
    }
  };

  /**
   * PUT /api/v1/ghl-clients/:locationId
   * Update a GHL client configuration by locationId
   * Body: { ghlApiToken?, queryValue?, queryValue2?, revenueProClientId?, status? }
   * Only updates the fields that are provided in the request body
   */
  public updateGhlClient = async (req: Request, res: Response): Promise<void> => {
    try {
      const { locationId } = req.params;
      const { ghlApiToken, queryValue, queryValue2, revenueProClientId, status } = req.body;

      // Log all incoming values from frontend
      logger.info('[GHL Client Update] Request received', {
        locationId,
        queryValue,
        queryValue2,
        revenueProClientId,
        status,
        ghlApiTokenLength: ghlApiToken?.length || 0,
        hasGhlApiToken: !!ghlApiToken,
        bodyKeys: Object.keys(req.body),
      });

      // Check if at least one field is being updated
      if (!ghlApiToken && !queryValue && queryValue2 === undefined && !revenueProClientId && !status) {
        logger.warn('[GHL Client Update] No fields to update', { locationId });
        utils.sendErrorResponse(
          res,
          new CustomError(ErrorCode.BAD_REQUEST, "At least one field must be provided for update: ghlApiToken, queryValue, queryValue2, revenueProClientId, or status")
        );
        return;
      }

      // Validate status enum if provided
      if (status && !['active', 'inactive', 'deleted'].includes(status)) {
        logger.warn('[GHL Client Update] Invalid status value', { locationId, status });
        utils.sendErrorResponse(
          res,
          new CustomError(ErrorCode.BAD_REQUEST, "Status must be one of: active, inactive, deleted")
        );
        return;
      }

      const updatedClient = await this.ghlClientService.updateGhlClientByLocationId(
        locationId,
        {
          ghlApiToken,
          queryValue,
          queryValue2,
          revenueProClientId,
          status,
        }
      );

      if (!updatedClient) {
        utils.sendErrorResponse(res, new CustomError(ErrorCode.NOT_FOUND, "GHL client not found"));
        return;
      }

      // Log the pipeline ID in the response
      logger.info('[GHL Client Update] Response data', {
        locationId: updatedClient.locationId,
        pipelineId: updatedClient.pipelineId,
        hasPipelineId: !!updatedClient.pipelineId,
      });
      console.log(`[GHL Client Update] Response pipeline ID:`, {
        locationId: updatedClient.locationId,
        pipelineId: updatedClient.pipelineId,
        hasPipelineId: !!updatedClient.pipelineId,
      });

      utils.sendSuccessResponse(res, 200, {
        success: true,
        message: "GHL client configuration updated successfully",
        data: this.mapClientToResponse(updatedClient, { includeUpdatedAt: true }),
      });
    } catch (error: any) {
      // Log the error
      logger.error('[GHL Client Update] Failed', {
        error: error.message || String(error),
        errorCode: error.code,
        locationId: req.params.locationId,
        bodyKeys: Object.keys(req.body),
      });

      // Handle not found error
      if (error.message?.includes("not found")) {
        utils.sendErrorResponse(res, new CustomError(ErrorCode.NOT_FOUND, error.message));
        return;
      }

      // Handle pipeline ID fetch failure
      if (error.message?.includes("Failed to fetch pipeline ID")) {
        utils.sendErrorResponse(res, new CustomError(ErrorCode.BAD_REQUEST, error.message));
        return;
      }

      utils.sendErrorResponse(res, error);
    }
  };
}

export default new GhlClientController();

