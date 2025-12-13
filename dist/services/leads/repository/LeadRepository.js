import LeadModel from './models/leads.model.js';
export class LeadRepository {
    // Helper method to add soft delete filter consistently
    addSoftDeleteFilter(query) {
        return { ...query, isDeleted: false };
    }
    // Basic CRUD operations
    async updateLead(queryOrId, update) {
        const query = typeof queryOrId === 'string'
            ? { _id: queryOrId, isDeleted: false }
            : this.addSoftDeleteFilter(queryOrId);
        return await LeadModel.findOneAndUpdate(query, update, { new: true }).exec();
    }
    async deleteLead(id) {
        return await LeadModel.findByIdAndUpdate(id, { $set: { isDeleted: true, deletedAt: new Date(), lastManualUpdate: new Date() } }, { new: true }).exec();
    }
    // Query operations
    async getLeadById(id) {
        return await LeadModel.findOne({ _id: id, isDeleted: false }).exec();
    }
    async getLeads(filter = {}) {
        return await LeadModel.find(this.addSoftDeleteFilter(filter)).exec();
    }
    async getLeadsByClientId(clientId) {
        return await LeadModel.find({ clientId, isDeleted: false }).lean().exec();
    }
    async getLeadsByDateRange(start, end) {
        return await LeadModel.find({
            leadDate: { $gte: start, $lte: end },
            isDeleted: false
        }).exec();
    }
    async getLeadsByDateRangeAndClientId(clientId, start, end) {
        return await LeadModel.find({
            clientId: clientId,
            leadDate: { $gte: start, $lte: end },
            isDeleted: false
        }).exec();
    }
    async findLeads(query = {}) {
        return await LeadModel.find(this.addSoftDeleteFilter(query)).lean().exec();
    }
    // Bulk operations
    async insertMany(leads) {
        const normalizedLeads = leads.map(lead => ({ ...lead, isDeleted: false }));
        return await LeadModel.insertMany(normalizedLeads);
    }
    async bulkWriteLeads(bulkOps, options) {
        return await LeadModel.bulkWrite(bulkOps, options);
    }
    async bulkDeleteLeads(ids) {
        const query = { _id: { $in: ids }, isDeleted: false };
        const update = {
            $set: {
                isDeleted: true,
                deletedAt: new Date(),
                lastManualUpdate: new Date()
            }
        };
        const result = await LeadModel.updateMany(query, update).exec();
        return { modifiedCount: result.modifiedCount || 0 };
    }
    async updateManyLeads(query, update) {
        const finalQuery = this.addSoftDeleteFilter(query);
        return await LeadModel.updateMany(finalQuery, update).exec();
    }
    // Utility operations
    async existsByClientId(clientId) {
        const doc = await LeadModel.exists({ clientId, isDeleted: false });
        return doc !== null;
    }
    async getDistinctClientIds() {
        return await LeadModel.distinct("clientId", { isDeleted: false }).exec();
    }
    async aggregateLeadActivity() {
        return LeadModel.aggregate([
            {
                $match: { isDeleted: false }
            },
            {
                $project: { clientId: 1, lastManualUpdate: 1 } // use only needed fields
            },
            {
                $sort: { clientId: 1, lastManualUpdate: -1 } // sort using the index
            },
            {
                $group: {
                    _id: "$clientId",
                    leadLastActiveAt: { $first: "$lastManualUpdate" } // first entry per client after sort
                }
            },
            {
                $sort: { leadLastActiveAt: -1 } // final sorting by last active time
            }
        ]).exec();
    }
    // Upsert operation
    async upsertLead(query, leadPayload) {
        const finalQuery = this.addSoftDeleteFilter(query);
        const finalPayload = { ...leadPayload, isDeleted: false };
        return await LeadModel.findOneAndUpdate(finalQuery, { $set: finalPayload }, {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
        }).exec();
    }
}
// Export singleton instance
export const leadRepository = new LeadRepository();
