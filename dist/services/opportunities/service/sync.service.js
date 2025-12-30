import http from '../../../pkg/http/client.js';
import { config } from '../../../config.js';
export class OpportunitySyncService {
    constructor() {
        this.client = new http(config.GHL_BASE_URL, 15000);
    }
    async fetchOpportunities(locationId, tokenOverride) {
        const token = tokenOverride;
        if (!token)
            throw new Error('GHL_API_TOKEN not configured');
        // Paginate through the search endpoint
        let url = `/opportunities/search?location_id=${encodeURIComponent(locationId)}`;
        const aggregated = [];
        let lastMeta = { total: 0 };
        while (url) {
            const page = await this.client.get(url, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Version: '2021-07-28',
                },
            });
            if (page?.opportunities?.length) {
                aggregated.push(...page.opportunities);
            }
            lastMeta = page?.meta || lastMeta;
            const nextUrl = page?.meta?.nextPageUrl;
            url = nextUrl && nextUrl.length > 0 ? nextUrl : null;
        }
        return { opportunities: aggregated, meta: { ...lastMeta, total: aggregated.length } };
    }
    async sync(locationId) {
        const ghlApiResponse = await this.fetchOpportunities(locationId);
        const opportunities = ghlApiResponse.opportunities || [];
        const currentIds = [];
        return {
            success: true,
            synced: opportunities.length,
            deleted: 0,
            total: ghlApiResponse.meta?.total ?? opportunities.length,
        };
    }
}
export default new OpportunitySyncService();
