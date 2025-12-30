import IPTracking from "./models/ipTracking.model.js";
class IPTrackingRepository {
    async createIPTracking(ipTrackingData) {
        const ipTracking = new IPTracking(ipTrackingData);
        return await ipTracking.save();
    }
    async getIPTrackingByUserId(userId, limit = 100) {
        return await IPTracking.find({ userId })
            .sort({ timestamp: -1 })
            .limit(limit)
            .exec();
    }
}
export default IPTrackingRepository;
