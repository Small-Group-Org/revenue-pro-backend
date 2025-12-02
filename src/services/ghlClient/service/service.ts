import { GhlClientRepository } from "../repository/repository.js";
import { IGhlClient } from "../domain/ghlClient.domain.js";
import { encrypt, decrypt } from "../utils/encryption.js";
import http from "../../../pkg/http/client.js";
import { config } from "../../../config.js";

type CustomFieldSearchResponse = {
  customFields: Array<{
    _id: string;
    id: string;
    name: string;
    fieldKey: string;
    locationId: string;
    dataType: string;
  }>;
  totalItems: number;
  traceId?: string;
};

type PipelineResponse = {
  pipelines: Array<{
    id: string;
    name: string;
    stages: Array<{
      id: string;
      name: string;
      position: number;
    }>;
    dateAdded: string;
    dateUpdated: string;
    originId?: string;
    showInFunnel?: boolean;
    showInPieChart?: boolean;
  }>;
};

export class GhlClientService {
  private repository: GhlClientRepository;

  constructor() {
    this.repository = new GhlClientRepository();
  }

  /**
   * Create a new GHL client configuration
   */
  async createGhlClient(
    locationId: string,
    apiToken: string,
    queryValue: string,
    revenueProClientId: string,
    status: 'active' | 'inactive' | 'deleted' = 'active',
    queryValue2?: string
  ): Promise<IGhlClient> {
    // Encrypt the API token before storing
    const encryptedApiToken = encrypt(apiToken);

    // Set default value for queryValue2 if not provided
    const queryValue2WithDefault = queryValue2 || 'Last Date Tag Changed';

    // Fetch the custom field ID from GHL API - REQUIRED
    // If this fails, we should not create the client
    let customFieldId: string | undefined;
    try {
      customFieldId = await this.fetchCustomFieldId(locationId, apiToken, queryValue);
      if (!customFieldId) {
        throw new Error(`Custom field not found for query value: ${queryValue}`);
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error(`[GHL Client Create] Failed to fetch custom field ID for location ${locationId}:`, {
        locationId,
        queryValue,
        error: errorMessage,
        errorCode: error?.code,
      });
      // Throw error to prevent client creation if custom field fetch fails
      throw new Error(`Failed to fetch custom field ID from GHL API: ${errorMessage}. Please verify the location ID, API token, and query value are correct.`);
    }

    // Fetch the custom field ID for queryValue2 (Last Date Tag Changed) - OPTIONAL
    // Always fetch since we have a default value
    let customFieldId2: string | undefined;
    try {
      customFieldId2 = await this.fetchCustomFieldId(locationId, apiToken, queryValue2WithDefault);
      if (!customFieldId2) {
        console.warn(`[GHL Client Create] Custom field not found for queryValue2: ${queryValue2WithDefault}, continuing without it`);
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.warn(`[GHL Client Create] Failed to fetch custom field ID for queryValue2 (location ${locationId}):`, {
        locationId,
        queryValue2: queryValue2WithDefault,
        error: errorMessage,
        errorCode: error?.code,
      });
      // Don't throw error for queryValue2, just log it - it's optional
    }

    // Fetch the pipeline ID from GHL API - REQUIRED
    // Search for "Sales Pipeline 💵" which is common across all clients
    let pipelineId: string | undefined;
    try {
      pipelineId = await this.fetchPipelineId(locationId, apiToken);
      if (!pipelineId) {
        throw new Error(`Pipeline "Sales Pipeline 💵" not found for location ${locationId}`);
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error(`[GHL Client Create] Failed to fetch pipeline ID for location ${locationId}:`, {
        locationId,
        error: errorMessage,
        errorCode: error?.code,
      });
      // Throw error to prevent client creation if pipeline fetch fails
      throw new Error(`Failed to fetch pipeline ID from GHL API: ${errorMessage}. Please verify the location ID and API token are correct.`);
    }

    return await this.repository.createGhlClient(
      locationId,
      encryptedApiToken,
      queryValue,
      revenueProClientId,
      customFieldId,
      pipelineId,
      status,
      queryValue2WithDefault,
      customFieldId2
    );
  }

  /**
   * Fetch custom field ID from GHL API
   */
  async fetchCustomFieldId(
    locationId: string,
    apiToken: string,
    queryValue: string
  ): Promise<string | undefined> {
    const client = new http("https://backend.leadconnectorhq.com", 15000);
    const encodedQuery = encodeURIComponent(queryValue);

    const response = await client.get<CustomFieldSearchResponse>(
      `/locations/${locationId}/customFields/search?parentId=&skip=0&limit=10&documentType=field&model=all&query=${encodedQuery}&includeStandards=true`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          Version: "2021-07-28",
        },
      }
    );

    if (response?.customFields && response.customFields.length > 0) {
      return response.customFields[0].id || response.customFields[0]._id;
    }

    return undefined;
  }

  /**
   * Fetch pipeline ID from GHL API
   * Searches for "Sales Pipeline 💵" which is common across all clients
   */
  async fetchPipelineId(
    locationId: string,
    apiToken: string
  ): Promise<string | undefined> {
    const client = new http(config.GHL_BASE_URL, 15000);
    const apiUrl = `/opportunities/pipelines?locationId=${encodeURIComponent(locationId)}`;

    console.log(`[GHL Client] Fetching pipeline ID from GHL API:`, {
      locationId,
      apiUrl,
      baseUrl: config.GHL_BASE_URL,
      hasApiToken: !!apiToken,
      apiTokenLength: apiToken?.length || 0,
    });

    try {
      const response = await client.get<PipelineResponse>(
        apiUrl,
        {
          headers: {
            Authorization: `Bearer ${apiToken}`,
            Version: "2021-07-28",
          },
        }
      );

      console.log(`[GHL Client] Pipeline API response received:`, {
        locationId,
        hasResponse: !!response,
        pipelinesCount: response?.pipelines?.length || 0,
        pipelineNames: response?.pipelines?.map(p => p.name) || [],
      });

      if (response?.pipelines && response.pipelines.length > 0) {
        // Search for pipeline with name "Sales Pipeline 💵"
        const salesPipeline = response.pipelines.find(
          (pipeline) => pipeline.name === "Sales Pipeline 💵"
        );

        if (salesPipeline) {
          console.log(`[GHL Client] Pipeline "Sales Pipeline 💵" found:`, {
            locationId,
            pipelineId: salesPipeline.id,
            pipelineName: salesPipeline.name,
          });
          return salesPipeline.id;
        } else {
          console.error(`[GHL Client] Pipeline "Sales Pipeline 💵" not found in response:`, {
            locationId,
            availablePipelines: response.pipelines.map(p => ({ id: p.id, name: p.name })),
            totalPipelines: response.pipelines.length,
          });
        }
      } else {
        console.error(`[GHL Client] No pipelines found in response:`, {
          locationId,
          response: response,
        });
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      const errorCode = error?.code || error?.status || error?.statusCode;
      const errorResponse = error?.response || error?.data;

      console.error(`[GHL Client] API call to fetch pipeline ID FAILED:`, {
        locationId,
        apiUrl: `${config.GHL_BASE_URL}${apiUrl}`,
        error: errorMessage,
        errorCode: errorCode,
        errorResponse: errorResponse,
        errorStack: error?.stack,
        errorType: error?.constructor?.name,
      });

      // Re-throw the error so it can be handled by the caller
      throw new Error(`Failed to fetch pipeline ID from GHL API: ${errorMessage}`);
    }

    return undefined;
  }

  /**
   * Get GHL client by location ID with decrypted API token
   */
  async getGhlClientByLocationId(locationId: string): Promise<IGhlClient | null> {
    return await this.repository.getGhlClientByLocationId(locationId);
  }

  /**
   * Get all active GHL clients
   */
  async getAllActiveGhlClients(): Promise<IGhlClient[]> {
    return await this.repository.getAllActiveGhlClients();
  }

  /**
   * Get GHL clients by RevenuePro client ID
   */
  async getGhlClientsByRevenueProClientId(revenueProClientId: string): Promise<IGhlClient[]> {
    return await this.repository.getGhlClientsByRevenueProClientId(revenueProClientId);
  }

  /**
   * Get decrypted API token for a client
   */
  getDecryptedApiToken(ghlClient: IGhlClient): string {
    return decrypt(ghlClient.encryptedApiToken);
  }

  /**
   * Update GHL client configuration by locationId
   */
  async updateGhlClientByLocationId(
    locationId: string,
    updates: {
      ghlApiToken?: string;
      queryValue?: string;
      queryValue2?: string;
      revenueProClientId?: string;
      status?: 'active' | 'inactive' | 'deleted';
    }
  ): Promise<IGhlClient | null> {
    // First, get the existing client to get the current API token if needed
    const existingClient = await this.repository.getGhlClientByLocationId(locationId);
    if (!existingClient) {
      throw new Error(`GHL client with locationId ${locationId} not found`);
    }

    // Log existing pipeline ID
    console.log(`[GHL Client Update] Existing client pipeline ID:`, {
      locationId,
      existingPipelineId: existingClient.pipelineId,
      isUpdatingApiToken: !!updates.ghlApiToken,
    });

    const updateData: {
      encryptedApiToken?: string;
      queryValue?: string;
      customFieldId?: string;
      queryValue2?: string;
      customFieldId2?: string;
      pipelineId?: string;
      revenueProClientId?: string;
      status?: 'active' | 'inactive' | 'deleted';
    } = {};

    // Determine which API token to use (new one if provided, otherwise existing one)
    const apiTokenToUse = updates.ghlApiToken || this.getDecryptedApiToken(existingClient);
    const queryValueToUse = updates.queryValue || existingClient.queryValue;
    const queryValue2ToUse = updates.queryValue2 !== undefined ? updates.queryValue2 : existingClient.queryValue2;

    // If API token or query value is being updated, fetch new customFieldId
    if (updates.ghlApiToken || updates.queryValue) {
      try {
        const customFieldId = await this.fetchCustomFieldId(locationId, apiTokenToUse, queryValueToUse);
        if (customFieldId) {
          updateData.customFieldId = customFieldId;
        } else {
          console.warn(`[GHL Client Update] Failed to fetch custom field ID for location ${locationId}, keeping existing value`);
        }
      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        console.error(`[GHL Client Update] Failed to fetch custom field ID for location ${locationId}:`, {
          locationId,
          queryValue: queryValueToUse,
          error: errorMessage,
          errorCode: error?.code,
        });
        // Don't throw error, just log it - we'll keep the existing customFieldId
      }
    }

    // If API token or queryValue2 is being updated, fetch new customFieldId2
    if (updates.ghlApiToken || updates.queryValue2 !== undefined) {
      if (queryValue2ToUse) {
        try {
          const customFieldId2 = await this.fetchCustomFieldId(locationId, apiTokenToUse, queryValue2ToUse);
          if (customFieldId2) {
            updateData.customFieldId2 = customFieldId2;
          } else {
            console.warn(`[GHL Client Update] Failed to fetch custom field ID2 for location ${locationId}, keeping existing value`);
          }
        } catch (error: any) {
          const errorMessage = error?.message || String(error);
          console.warn(`[GHL Client Update] Failed to fetch custom field ID2 for location ${locationId}:`, {
            locationId,
            queryValue2: queryValue2ToUse,
            error: errorMessage,
            errorCode: error?.code,
          });
          // Don't throw error, just log it - queryValue2 is optional
        }
      } else if (updates.queryValue2 === null || updates.queryValue2 === '') {
        // If queryValue2 is being cleared, also clear customFieldId2
        updateData.customFieldId2 = undefined;
      }
    }

    // If API token is being updated, fetch new pipelineId (MANDATORY)
    if (updates.ghlApiToken) {
      console.log(`[GHL Client Update] Fetching pipeline ID for location ${locationId}...`);
      try {
        const pipelineId = await this.fetchPipelineId(locationId, apiTokenToUse);
        console.log(`[GHL Client Update] Pipeline ID fetch result:`, {
          locationId,
          fetchedPipelineId: pipelineId,
          success: !!pipelineId,
        });
        if (!pipelineId) {
          const errorMsg = `Failed to fetch pipeline ID from GHL API for location ${locationId}. Pipeline "Sales Pipeline 💵" not found.`;
          console.error(`[GHL Client Update] ${errorMsg}`);
          throw new Error(errorMsg);
        }
        updateData.pipelineId = pipelineId;
        console.log(`[GHL Client Update] Pipeline ID will be updated to: ${pipelineId}`);
      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        console.error(`[GHL Client Update] Failed to fetch pipeline ID for location ${locationId}:`, {
          locationId,
          error: errorMessage,
          errorCode: error?.code,
          existingPipelineId: existingClient.pipelineId,
        });
        // Throw error - pipeline ID is mandatory
        throw new Error(`Failed to fetch pipeline ID from GHL API: ${errorMessage}. Please verify the location ID and API token are correct.`);
      }
    } else {
      // If API token is not updated, ensure existing pipeline ID exists
      if (!existingClient.pipelineId) {
        console.error(`[GHL Client Update] Existing client has no pipeline ID:`, {
          locationId,
          existingClient: {
            locationId: existingClient.locationId,
            pipelineId: existingClient.pipelineId,
          },
        });
        throw new Error(`GHL client with locationId ${locationId} has no pipeline ID. Please update the API token to fetch the pipeline ID.`);
      }
      console.log(`[GHL Client Update] API token not updated, keeping existing pipeline ID: ${existingClient.pipelineId}`);
    }

    // Encrypt API token if provided
    if (updates.ghlApiToken) {
      updateData.encryptedApiToken = encrypt(updates.ghlApiToken);
    }

    // Update other fields if provided
    if (updates.queryValue) {
      updateData.queryValue = updates.queryValue;
    }
    if (updates.queryValue2 !== undefined) {
      updateData.queryValue2 = updates.queryValue2;
    }
    if (updates.revenueProClientId) {
      updateData.revenueProClientId = updates.revenueProClientId;
    }
    if (updates.status) {
      updateData.status = updates.status;
    }

    // Log final update data before saving
    console.log(`[GHL Client Update] Final update data:`, {
      locationId,
      updateData: {
        ...updateData,
        encryptedApiToken: updateData.encryptedApiToken ? '[ENCRYPTED]' : undefined,
      },
      pipelineIdInUpdate: updateData.pipelineId,
      existingPipelineId: existingClient.pipelineId,
    });

    const updatedClient = await this.repository.updateGhlClientByLocationId(locationId, updateData);

    // Log final result
    if (updatedClient) {
      console.log(`[GHL Client Update] Client updated successfully:`, {
        locationId,
        finalPipelineId: updatedClient.pipelineId,
        wasPipelineIdUpdated: updateData.pipelineId !== undefined,
      });
    }

    return updatedClient;
  }

  /**
   * Delete GHL client (soft delete)
   */
  async deleteGhlClient(id: string): Promise<boolean> {
    return await this.repository.deleteGhlClient(id);
  }
}

export default new GhlClientService();

