import http from '../../../pkg/http/client.js';
import { config } from '../../../config.js';

type GhlOpportunity = {
  id: string;
  name: string;
  monetaryValue: number;
  status: string;
  pipelineId: string;
  pipelineStageId: string;
  contactId?: string;
  contact?: {
    name?: string;
    email?: string;
    phone?: string;
    companyName?: string;
  };
  assignedTo?: string;
  source?: string;
  createdAt: string;
  updatedAt: string;
  lastStageChangeAt: string;
  lastStatusChangeAt: string;
};

type GhlResponse = {
  opportunities: GhlOpportunity[];
  meta: {
    total: number;
    nextPageUrl?: string | null;
    startAfterId?: string | null;
    startAfter?: number | null;
  };
};

export class OpportunitySyncService {
  private client: http;

  constructor() {
    this.client = new http(config.GHL_BASE_URL, 15000);
  }

  public async fetchOpportunities(locationId: string, tokenOverride?: string): Promise<GhlResponse> {
    const token = tokenOverride;
    if (!token) throw new Error('GHL_API_TOKEN not configured');

    // Paginate through the search endpoint
    let url: string | null = `/opportunities/search?location_id=${encodeURIComponent(locationId)}`;
    const aggregated: GhlOpportunity[] = [];
    let lastMeta: GhlResponse['meta'] = { total: 0 } as any;

    while (url) {
      const page: GhlResponse = await this.client.get<GhlResponse>(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Version: '2021-07-28',
        },
      });

      if (page?.opportunities?.length) {
        aggregated.push(...page.opportunities);
      }
      lastMeta = page?.meta || lastMeta;
      const nextUrl: string | null | undefined = page?.meta?.nextPageUrl;
      url = nextUrl && nextUrl.length > 0 ? nextUrl : null;
    }

    return { opportunities: aggregated, meta: { ...lastMeta, total: aggregated.length } } as GhlResponse;
  }

  public async sync(locationId: string): Promise<{ success: boolean; synced: number; deleted: number; total: number }> {
    const ghlApiResponse = await this.fetchOpportunities(locationId);
    const opportunities = ghlApiResponse.opportunities || [];
    const currentIds: string[] = [];

    return {
      success: true,
      synced: opportunities.length,
      deleted: 0,
      total: ghlApiResponse.meta?.total ?? opportunities.length,
    };
  }
}

export default new OpportunitySyncService();


