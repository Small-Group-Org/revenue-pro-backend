import crypto from "crypto";
import { CustomError, ErrorCode } from "../../../pkg/error/custom_error.js";
import utils from "../../../utils/utils.js";
class IPTrackingService {
    constructor(ipTrackingRepository, userService) {
        this.ipTrackingRepository = ipTrackingRepository;
        this.userService = userService;
    }
    async trackUserActivity(context, req, userId) {
        try {
            const ipAddress = this.getClientIP(req);
            const userAgent = req.get("User-Agent") || "";
            const timestamp = new Date();
            // Get additional headers for comprehensive tracking
            const referer = req.get("Referer") || req.get("Referrer") || "";
            const acceptLanguage = req.get("Accept-Language") || "";
            // Get all IP-related headers for audit trail
            const forwardedFor = req.get('X-Forwarded-For') || undefined;
            const realIp = req.get('X-Real-IP') || undefined;
            const clientIp = req.get('X-Client-IP') || undefined;
            const cfConnectingIp = req.get('CF-Connecting-IP') || undefined;
            const ipTrackingData = {
                ipAddress,
                hashedIp: this.hashIP(ipAddress), // Hash for privacy compliance
                timestamp,
                userId,
                userAgent,
                referer: referer || undefined,
                acceptLanguage: acceptLanguage || undefined,
                // Store all IP headers for legal audit trail
                forwardedFor,
                realIp,
                clientIp,
                cfConnectingIp,
                // Integrity hash for tamper detection
                integrityHash: '', // Will be set below
            };
            ipTrackingData.integrityHash = this.createIntegrityHash(ipTrackingData);
            const ipTracking = await this.ipTrackingRepository.createIPTracking(ipTrackingData);
            await this.userService.updateUserLoginStatus(userId, true);
            return ipTracking;
        }
        catch (error) {
            console.error('Error in trackUserActivity:', error);
            throw utils.ThrowableError(error);
        }
    }
    async getUserActivityHistory(context, userId, limit = 100) {
        try {
            if (!userId) {
                throw new CustomError(ErrorCode.BAD_REQUEST, "User ID is required");
            }
            return await this.ipTrackingRepository.getIPTrackingByUserId(userId, limit);
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
    getClientIP(req) {
        const forwarded = req.headers["x-forwarded-for"];
        const ip = forwarded
            ? (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0])
            : req.connection.remoteAddress || req.socket.remoteAddress || "unknown";
        // Remove IPv6 prefix if present
        return ip.replace(/^::ffff:/, "");
    }
    /**
     * Hash IP address for privacy compliance
     */
    hashIP(ipAddress) {
        return crypto.createHash('sha256').update(ipAddress).digest('hex');
    }
    /**
     * Create integrity hash for tamper detection
     * Excludes the integrityHash field itself to avoid circular dependency
     */
    createIntegrityHash(data) {
        const { integrityHash, ...dataToHash } = data;
        const dataString = JSON.stringify(dataToHash, Object.keys(dataToHash).sort());
        return crypto.createHash('sha256').update(dataString).digest('hex');
    }
    /**
     * Verify integrity hash to detect tampering
     */
    verifyIntegrity(ipTrackingRecord) {
        const { integrityHash, ...dataToVerify } = ipTrackingRecord.toObject();
        const expectedHash = this.createIntegrityHash(dataToVerify);
        return integrityHash === expectedHash;
    }
}
export default IPTrackingService;
