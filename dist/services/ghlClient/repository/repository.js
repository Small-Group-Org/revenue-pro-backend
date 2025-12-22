import { ErrorCode } from "../../../pkg/error/custom_error.js";
import GhlClient from "./models/ghlClient.model.js";
import utils from "../../../utils/utils.js";
export class GhlClientRepository {
    async createGhlClient(locationId, encryptedApiToken, queryValue, revenueProClientId, customFieldId, pipelineId, status = 'active', queryValue2, customFieldId2, apptBookedTagDateFieldId, jobWonTagDateFieldId, jobLostTagDateFieldId, apptCompletedTagDateFieldId, disqualifiedTagDateFieldId) {
        try {
            // Check if locationId already exists (only check active clients)
            if (status === 'active') {
                const existing = await GhlClient.findOne({ locationId, status: 'active' });
                if (existing) {
                    throw utils.ThrowableError(`GHL client with locationId ${locationId} already exists`, ErrorCode.BAD_REQUEST);
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
                queryValue2,
                customFieldId2,
                apptBookedTagDateFieldId,
                jobWonTagDateFieldId,
                jobLostTagDateFieldId,
                apptCompletedTagDateFieldId,
                disqualifiedTagDateFieldId,
            });
            await ghlClient.save();
            return ghlClient;
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
    async getGhlClientByLocationId(locationId) {
        try {
            if (!locationId) {
                return null;
            }
            return await GhlClient.findOne({ locationId, status: 'active' });
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
    async getAllActiveGhlClients() {
        try {
            return await GhlClient.find({ status: 'active' });
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
    async getGhlClientsByRevenueProClientId(revenueProClientId) {
        try {
            if (!revenueProClientId) {
                return [];
            }
            return await GhlClient.find({ revenueProClientId, status: 'active' });
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
    async getGhlClientById(id) {
        try {
            if (!id) {
                return null;
            }
            return await GhlClient.findOne({ _id: id, status: 'active' });
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
    async updateGhlClientByLocationId(locationId, updates) {
        try {
            return await GhlClient.findOneAndUpdate({ locationId, status: 'active' }, { $set: updates }, { new: true });
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
    async deleteGhlClient(id) {
        try {
            const result = await GhlClient.findOneAndUpdate({ _id: id, status: 'active' }, {
                $set: {
                    status: 'deleted',
                    deletedAt: new Date()
                }
            });
            return result !== null;
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
}
