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
    revenueProClientId: string
  ): Promise<IGhlClient> {
    // Encrypt the API token before storing
    const encryptedApiToken = encrypt(apiToken);

    // Optionally fetch the custom field ID from GHL API
    let customFieldId: string | undefined;
    try {
      customFieldId = await this.fetchCustomFieldId(locationId, apiToken, queryValue);
    } catch (error) {
      // Log but don't fail if we can't fetch the custom field ID
      console.warn(`Failed to fetch custom field ID for location ${locationId}:`, error);
    }

    return await this.repository.createGhlClient(
      locationId,
      encryptedApiToken,
      queryValue,
      revenueProClientId,
      customFieldId
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
   * Update GHL client configuration
   */
  async updateGhlClient(
    id: string,
    updates: {
      apiToken?: string;
      queryValue?: string;
      customFieldId?: string;
    }
  ): Promise<IGhlClient | null> {
    const updateData: {
      encryptedApiToken?: string;
      queryValue?: string;
      customFieldId?: string;
    } = {};

    if (updates.apiToken) {
      updateData.encryptedApiToken = encrypt(updates.apiToken);
    }
    if (updates.queryValue) {
      updateData.queryValue = updates.queryValue;
    }
    if (updates.customFieldId !== undefined) {
      updateData.customFieldId = updates.customFieldId;
    }

    return await this.repository.updateGhlClient(id, updateData);
  }

  /**
   * Delete GHL client (soft delete)
   */
  async deleteGhlClient(id: string): Promise<boolean> {
    return await this.repository.deleteGhlClient(id);
  }
}

export default new GhlClientService();

