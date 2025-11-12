import { Request, Response } from "express";
import ghlClientService from "../services/ghlClient/service/service.js";
import utils from "../utils/utils.js";
import { CustomError, ErrorCode } from "../pkg/error/custom_error.js";
import { IGhlClient } from "../services/ghlClient/domain/ghlClient.domain.js";
import logger from "../utils/logger.js";

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

      // Log all incoming values from frontend
      logger.info('[GHL Client Create] Request received', {
        locationId,
        queryValue,
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
          pipelineId: ghlClient.pipelineId,
          revenueProClientId: ghlClient.revenueProClientId,
          status: ghlClient.status,
          createdAt: ghlClient.created_at,
        },
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
      const clientsData = clients.map((client: IGhlClient) => ({
        id: client._id,
        locationId: client.locationId,
        queryValue: client.queryValue,
        customFieldId: client.customFieldId,
        pipelineId: client.pipelineId,
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
          pipelineId: client.pipelineId,
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

  /**
   * PUT /api/v1/ghl-clients/:locationId
   * Update a GHL client configuration by locationId
   * Body: { ghlApiToken?, queryValue?, revenueProClientId?, status? }
   * Only updates the fields that are provided in the request body
   */
  public updateGhlClient = async (req: Request, res: Response): Promise<void> => {
    try {
      const { locationId } = req.params;
      const { ghlApiToken, queryValue, revenueProClientId, status } = req.body;

      // Log all incoming values from frontend
      logger.info('[GHL Client Update] Request received', {
        locationId,
        queryValue,
        revenueProClientId,
        status,
        ghlApiTokenLength: ghlApiToken?.length || 0,
        hasGhlApiToken: !!ghlApiToken,
        bodyKeys: Object.keys(req.body),
      });

      // Check if at least one field is being updated
      if (!ghlApiToken && !queryValue && !revenueProClientId && !status) {
        logger.warn('[GHL Client Update] No fields to update', { locationId });
        utils.sendErrorResponse(
          res,
          new CustomError(ErrorCode.BAD_REQUEST, "At least one field must be provided for update: ghlApiToken, queryValue, revenueProClientId, or status")
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
        data: {
          id: updatedClient._id,
          locationId: updatedClient.locationId,
          queryValue: updatedClient.queryValue,
          customFieldId: updatedClient.customFieldId,
          pipelineId: updatedClient.pipelineId,
          revenueProClientId: updatedClient.revenueProClientId,
          status: updatedClient.status,
          createdAt: updatedClient.created_at,
          updatedAt: updatedClient.updated_at,
        },
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

