import { CustomError, ErrorCode } from "../../../pkg/error/custom_error.js";
import { IGhlClient } from "../domain/ghlClient.domain.js";
import GhlClient from "./models/ghlClient.model.js";
import utils from "../../../utils/utils.js";

export class GhlClientRepository {
  async createGhlClient(
    locationId: string,
    encryptedApiToken: string,
    queryValue: string,
    revenueProClientId: string,
    customFieldId?: string,
    pipelineId?: string,
    status: 'active' | 'inactive' | 'deleted' = 'active'
  ): Promise<IGhlClient> {
    try {
      // Check if locationId already exists (only check active clients)
      if (status === 'active') {
        const existing = await GhlClient.findOne({ locationId, status: 'active' });
        if (existing) {
          throw utils.ThrowableError(
            `GHL client with locationId ${locationId} already exists`,
            ErrorCode.BAD_REQUEST
          );
        }
      }

      const ghlClient = new GhlClient({
        locationId,
        encryptedApiToken,
        queryValue,
        revenueProClientId,
        customFieldId,
        pipelineId,
        status,
      });
      await ghlClient.save();
      return ghlClient;
    } catch (error) {
      throw utils.ThrowableError(error);
    }
  }

  async getGhlClientByLocationId(locationId: string): Promise<IGhlClient | null> {
    try {
      if (!locationId) {
        return null;
      }
      return await GhlClient.findOne({ locationId, status: 'active' });
    } catch (error) {
      throw utils.ThrowableError(error);
    }
  }

  async getAllActiveGhlClients(): Promise<IGhlClient[]> {
    try {
      return await GhlClient.find({ status: 'active' });
    } catch (error) {
      throw utils.ThrowableError(error);
    }
  }

  async getGhlClientsByRevenueProClientId(revenueProClientId: string): Promise<IGhlClient[]> {
    try {
      if (!revenueProClientId) {
        return [];
      }
      return await GhlClient.find({ revenueProClientId, status: 'active' });
    } catch (error) {
      throw utils.ThrowableError(error);
    }
  }

  async getGhlClientById(id: string): Promise<IGhlClient | null> {
    try {
      if (!id) {
        return null;
      }
      return await GhlClient.findOne({ _id: id, status: 'active' });
    } catch (error) {
      throw utils.ThrowableError(error);
    }
  }

  async updateGhlClientByLocationId(
    locationId: string,
    updates: {
      encryptedApiToken?: string;
      queryValue?: string;
      customFieldId?: string;
      pipelineId?: string;
      revenueProClientId?: string;
      status?: 'active' | 'inactive' | 'deleted';
    }
  ): Promise<IGhlClient | null> {
    try {
      return await GhlClient.findOneAndUpdate(
        { locationId, status: 'active' },
        { $set: updates },
        { new: true }
      );
    } catch (error) {
      throw utils.ThrowableError(error);
    }
  }

  async deleteGhlClient(id: string): Promise<boolean> {
    try {
      const result = await GhlClient.findOneAndUpdate(
        { _id: id, status: 'active' },
        { 
          $set: { 
            status: 'deleted',
            deletedAt: new Date()
          } 
        }
      );
      return result !== null;
    } catch (error) {
      throw utils.ThrowableError(error);
    }
  }
}

