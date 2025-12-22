import { GhlClientRepository } from "../repository/repository.js";
import { encrypt, decrypt } from "../utils/encryption.js";
import http from "../../../pkg/http/client.js";
import { config } from "../../../config.js";
export class GhlClientService {
    constructor() {
        this.repository = new GhlClientRepository();
    }
    /**
     * Create a new GHL client configuration
     */
    async createGhlClient(locationId, apiToken, queryValue, revenueProClientId, status = 'active', queryValue2) {
        // Encrypt the API token before storing
        const encryptedApiToken = encrypt(apiToken);
        // Set default value for queryValue2 if not provided
        const queryValue2WithDefault = queryValue2 || 'Last Date Tag Changed';
        // Fetch the custom field ID from GHL API - REQUIRED
        // If this fails, we should not create the client
        let customFieldId;
        try {
            customFieldId = await this.fetchCustomFieldId(locationId, apiToken, queryValue);
            if (!customFieldId) {
                throw new Error(`Custom field not found for query value: ${queryValue}`);
            }
        }
        catch (error) {
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
        let customFieldId2;
        try {
            customFieldId2 = await this.fetchCustomFieldId(locationId, apiToken, queryValue2WithDefault);
            if (!customFieldId2) {
                console.warn(`[GHL Client Create] Custom field not found for queryValue2: ${queryValue2WithDefault}, continuing without it`);
            }
        }
        catch (error) {
            const errorMessage = error?.message || String(error);
            console.warn(`[GHL Client Create] Failed to fetch custom field ID for queryValue2 (location ${locationId}):`, {
                locationId,
                queryValue2: queryValue2WithDefault,
                error: errorMessage,
                errorCode: error?.code,
            });
            // Don't throw error for queryValue2, just log it - it's optional
        }
        // Fetch tag-based date custom field IDs - OPTIONAL
        let tagBasedDateFieldIds = {};
        try {
            tagBasedDateFieldIds = await this.fetchTagBasedDateFieldIds(locationId, apiToken);
            console.log(`[GHL Client Create] Fetched tag-based date field IDs:`, {
                locationId,
                ...tagBasedDateFieldIds,
            });
        }
        catch (error) {
            const errorMessage = error?.message || String(error);
            console.warn(`[GHL Client Create] Failed to fetch tag-based date field IDs (location ${locationId}):`, {
                locationId,
                error: errorMessage,
                errorCode: error?.code,
            });
            // Don't throw error, just log it - these are optional
        }
        // Fetch the pipeline ID from GHL API - REQUIRED
        // Search for "Sales Pipeline 💵" which is common across all clients
        let pipelineId;
        try {
            pipelineId = await this.fetchPipelineId(locationId, apiToken);
            if (!pipelineId) {
                throw new Error(`Pipeline "Sales Pipeline 💵" not found for location ${locationId}`);
            }
        }
        catch (error) {
            const errorMessage = error?.message || String(error);
            console.error(`[GHL Client Create] Failed to fetch pipeline ID for location ${locationId}:`, {
                locationId,
                error: errorMessage,
                errorCode: error?.code,
            });
            // Throw error to prevent client creation if pipeline fetch fails
            throw new Error(`Failed to fetch pipeline ID from GHL API: ${errorMessage}. Please verify the location ID and API token are correct.`);
        }
        return await this.repository.createGhlClient(locationId, encryptedApiToken, queryValue, revenueProClientId, customFieldId, pipelineId, status, queryValue2WithDefault, customFieldId2, tagBasedDateFieldIds.apptBookedTagDateFieldId, tagBasedDateFieldIds.jobWonTagDateFieldId, tagBasedDateFieldIds.jobLostTagDateFieldId, tagBasedDateFieldIds.apptCompletedTagDateFieldId, tagBasedDateFieldIds.disqualifiedTagDateFieldId);
    }
    /**
     * Fetch custom field ID from GHL API
     */
    async fetchCustomFieldId(locationId, apiToken, queryValue) {
        const client = new http("https://backend.leadconnectorhq.com", 15000);
        const encodedQuery = encodeURIComponent(queryValue);
        const response = await client.get(`/locations/${locationId}/customFields/search?parentId=&skip=0&limit=10&documentType=field&model=all&query=${encodedQuery}&includeStandards=true`, {
            headers: {
                Authorization: `Bearer ${apiToken}`,
                Version: "2021-07-28",
            },
        });
        if (response?.customFields && response.customFields.length > 0) {
            return response.customFields[0].id || response.customFields[0]._id;
        }
        return undefined;
    }
    /**
     * Fetch all tag-based date custom field IDs from GHL API
     */
    async fetchTagBasedDateFieldIds(locationId, apiToken) {
        const fieldNames = [
            { key: 'apptBookedTagDateFieldId', name: 'Appt Booked Tag Added Date' },
            { key: 'jobWonTagDateFieldId', name: 'Job Won Tag Added Date' },
            { key: 'jobLostTagDateFieldId', name: 'Job Lost Tag Added Date' },
            { key: 'apptCompletedTagDateFieldId', name: 'Appt Completed Tag Added Date' },
            { key: 'disqualifiedTagDateFieldId', name: 'Disqualified Tag Added Date' },
        ];
        const result = {};
        // Fetch all field IDs in parallel
        const fetchPromises = fieldNames.map(async ({ key, name }) => {
            try {
                const fieldId = await this.fetchCustomFieldId(locationId, apiToken, name);
                if (fieldId) {
                    result[key] = fieldId;
                    console.log(`[GHL Client] Fetched ${name} field ID: ${fieldId}`);
                }
                else {
                    console.warn(`[GHL Client] Custom field not found: ${name}`);
                }
            }
            catch (error) {
                console.warn(`[GHL Client] Failed to fetch custom field ID for ${name}:`, {
                    locationId,
                    fieldName: name,
                    error: error?.message || String(error),
                });
            }
        });
        await Promise.all(fetchPromises);
        return result;
    }
    /**
     * Fetch pipeline ID from GHL API
     * Searches for "Sales Pipeline 💵" which is common across all clients
     */
    async fetchPipelineId(locationId, apiToken) {
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
            const response = await client.get(apiUrl, {
                headers: {
                    Authorization: `Bearer ${apiToken}`,
                    Version: "2021-07-28",
                },
            });
            console.log(`[GHL Client] Pipeline API response received:`, {
                locationId,
                hasResponse: !!response,
                pipelinesCount: response?.pipelines?.length || 0,
                pipelineNames: response?.pipelines?.map(p => p.name) || [],
            });
            if (response?.pipelines && response.pipelines.length > 0) {
                // Search for pipeline with name "Sales Pipeline 💵"
                const salesPipeline = response.pipelines.find((pipeline) => pipeline.name === "Sales Pipeline 💵");
                if (salesPipeline) {
                    console.log(`[GHL Client] Pipeline "Sales Pipeline 💵" found:`, {
                        locationId,
                        pipelineId: salesPipeline.id,
                        pipelineName: salesPipeline.name,
                    });
                    return salesPipeline.id;
                }
                else {
                    console.error(`[GHL Client] Pipeline "Sales Pipeline 💵" not found in response:`, {
                        locationId,
                        availablePipelines: response.pipelines.map(p => ({ id: p.id, name: p.name })),
                        totalPipelines: response.pipelines.length,
                    });
                }
            }
            else {
                console.error(`[GHL Client] No pipelines found in response:`, {
                    locationId,
                    response: response,
                });
            }
        }
        catch (error) {
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
    async getGhlClientByLocationId(locationId) {
        return await this.repository.getGhlClientByLocationId(locationId);
    }
    /**
     * Get all active GHL clients
     */
    async getAllActiveGhlClients() {
        return await this.repository.getAllActiveGhlClients();
    }
    /**
     * Get GHL clients by RevenuePro client ID
     */
    async getGhlClientsByRevenueProClientId(revenueProClientId) {
        return await this.repository.getGhlClientsByRevenueProClientId(revenueProClientId);
    }
    /**
     * Get decrypted API token for a client
     */
    getDecryptedApiToken(ghlClient) {
        return decrypt(ghlClient.encryptedApiToken);
    }
    /**
     * Update GHL client configuration by locationId
     */
    async updateGhlClientByLocationId(locationId, updates) {
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
        const updateData = {};
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
                }
                else {
                    console.warn(`[GHL Client Update] Failed to fetch custom field ID for location ${locationId}, keeping existing value`);
                }
            }
            catch (error) {
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
                    }
                    else {
                        console.warn(`[GHL Client Update] Failed to fetch custom field ID2 for location ${locationId}, keeping existing value`);
                    }
                }
                catch (error) {
                    const errorMessage = error?.message || String(error);
                    console.warn(`[GHL Client Update] Failed to fetch custom field ID2 for location ${locationId}:`, {
                        locationId,
                        queryValue2: queryValue2ToUse,
                        error: errorMessage,
                        errorCode: error?.code,
                    });
                    // Don't throw error, just log it - queryValue2 is optional
                }
            }
            else if (updates.queryValue2 === null || updates.queryValue2 === '') {
                // If queryValue2 is being cleared, also clear customFieldId2
                updateData.customFieldId2 = undefined;
            }
        }
        // Always fetch tag-based date custom field IDs on update if we have an API token
        // This ensures fields are populated even if they weren't set during initial creation
        // Fetch tag-based date custom field IDs - OPTIONAL
        try {
            const tagBasedDateFieldIds = await this.fetchTagBasedDateFieldIds(locationId, apiTokenToUse);
            console.log(`[GHL Client Update] Fetched tag-based date field IDs:`, {
                locationId,
                ...tagBasedDateFieldIds,
            });
            if (tagBasedDateFieldIds.apptBookedTagDateFieldId) {
                updateData.apptBookedTagDateFieldId = tagBasedDateFieldIds.apptBookedTagDateFieldId;
            }
            if (tagBasedDateFieldIds.jobWonTagDateFieldId) {
                updateData.jobWonTagDateFieldId = tagBasedDateFieldIds.jobWonTagDateFieldId;
            }
            if (tagBasedDateFieldIds.jobLostTagDateFieldId) {
                updateData.jobLostTagDateFieldId = tagBasedDateFieldIds.jobLostTagDateFieldId;
            }
            if (tagBasedDateFieldIds.apptCompletedTagDateFieldId) {
                updateData.apptCompletedTagDateFieldId = tagBasedDateFieldIds.apptCompletedTagDateFieldId;
            }
            if (tagBasedDateFieldIds.disqualifiedTagDateFieldId) {
                updateData.disqualifiedTagDateFieldId = tagBasedDateFieldIds.disqualifiedTagDateFieldId;
            }
        }
        catch (error) {
            const errorMessage = error?.message || String(error);
            console.warn(`[GHL Client Update] Failed to fetch tag-based date field IDs (location ${locationId}):`, {
                locationId,
                error: errorMessage,
                errorCode: error?.code,
            });
            // Don't throw error, just log it - these are optional
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
            }
            catch (error) {
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
        }
        else {
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
    async deleteGhlClient(id) {
        return await this.repository.deleteGhlClient(id);
    }
}
export default new GhlClientService();
