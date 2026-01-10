// facebookAds.domain.ts
// Domain types for Facebook/Meta advertising services

// ===== Ad Account Types =====
export interface AdAccount {
  id: string;
  account_id: string;
  name: string;
  account_status: number;
  currency: string;
  amount_spent: string;
  owner: string;
}

export interface AdAccountsResponse {
  adAccounts: AdAccount[];
}

// ===== Creative Types =====
export interface Creative {
  id?: string;
  name?: string;
  body?: string;
  title?: string;
  object_story_spec?: {
    link_data?: {
      message?: string;
      name?: string;
      description?: string;
      caption?: string;
      call_to_action?: {
        type?: string;
        value?: {
          lead_gen_form_id?: string;
          link?: string;
        };
      };
    };
  };
}

export interface AdWithCreative {
  id: string;
  name: string;
  campaign_id: string;
  adset_id: string;
  creative?: Creative;
}

export interface NormalizedAd {
  ad_id: string;
  ad_name: string;
  adset_id: string;
  campaign_id: string;
  creative: {
    id: string | null;
    name: string | null;
    primary_text: string | null;
    headline: string | null;
    raw: Creative;
  };
  lead_gen_form_id: string | null;
}

// ===== Lead Form Types =====
export interface LeadForm {
  id: string;
  name: string;
}

// ===== Insights Types =====
export interface AdInsight {
  // ===== IDENTIFIERS =====
  ad_id: string;
  ad_name: string;
  adset_id: string;
  adset_name: string;
  campaign_id: string;
  campaign_name: string;
  account_id?: string;
  account_name?: string;
  
  // ===== CAMPAIGN SETTINGS =====
  objective?: string;
  optimization_goal?: string;
  buying_type?: string;
  attribution_setting?: string;
  account_currency?: string;
  
  // ===== BASIC PERFORMANCE METRICS =====
  impressions: string;
  reach: string;
  frequency: string;
  clicks: string;
  unique_clicks: string;
  ctr: string;
  unique_ctr: string;
  cpc: string;
  cpm: string;
  cpp: string;
  
  // ===== SPEND & BUDGET =====
  spend: string;
  social_spend?: string;
  
  // ===== LINK CLICKS & CTR (Extended) =====
  inline_link_clicks?: string;
  outbound_clicks?: string;
  unique_outbound_clicks?: string;
  inline_link_click_ctr?: string;
  unique_inline_link_click_ctr?: string;
  cost_per_inline_link_click?: string;
  cost_per_unique_inline_link_click?: string;
  unique_link_clicks_ctr?: string;
  outbound_clicks_ctr?: string;
  unique_outbound_clicks_ctr?: string;
  cost_per_outbound_click?: string;
  cost_per_unique_outbound_click?: string;
  
  // ===== ENGAGEMENT METRICS =====
  inline_post_engagement?: string;
  cost_per_inline_post_engagement?: string;
  
  // ===== QUALITY & DELIVERY METRICS =====
  quality_ranking?: string;
  engagement_rate_ranking?: string;
  conversion_rate_ranking?: string;
  
  // ===== VIDEO METRICS =====
  video_30_sec_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p25_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p50_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p75_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p100_watched_actions?: Array<{ action_type: string; value: string }>;
  video_avg_time_watched_actions?: Array<{ action_type: string; value: string }>;
  video_play_actions?: Array<{ action_type: string; value: string }>;
  video_continuous_2_sec_watched_actions?: Array<{ action_type: string; value: string }>;
  video_thruplay_watched_actions?: Array<{ action_type: string; value: string }>;
  video_play_curve_actions?: Array<{ action_type: string; value: string }>;
  
  // ===== ACTIONS (includes landing_page_view, lead, purchase, etc.) =====
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
  cost_per_action_type?: Array<{ action_type: string; value: string }>;
  cost_per_unique_action_type?: Array<{ action_type: string; value: string }>;
  unique_actions?: Array<{ action_type: string; value: string }>;
  
  // ===== CONVERSIONS =====
  conversions?: Array<{ action_type: string; value: string }>;
  conversion_values?: Array<{ action_type: string; value: string }>;
  cost_per_conversion?: Array<{ action_type: string; value: string }>;
  converted_product_quantity?: Array<{ action_type: string; value: string }>;
  converted_product_value?: Array<{ action_type: string; value: string }>;
  
  // ===== WEBSITE & OFFSITE CONVERSION METRICS =====
  website_ctr?: Array<{ action_type: string; value: string }>;
  offsite_conversion?: Array<{ action_type: string; value: string }>;
  
  // ===== MOBILE APP METRICS =====
  mobile_app_purchase_roas?: Array<{ action_type: string; value: string }>;
  website_purchase_roas?: Array<{ action_type: string; value: string }>;
  purchase_roas?: Array<{ action_type: string; value: string }>;
  
  // ===== CANVAS & INSTANT EXPERIENCE =====
  canvas_avg_view_percent?: string;
  canvas_avg_view_time?: string;
  instant_experience_clicks_to_open?: string;
  instant_experience_clicks_to_start?: string;
  instant_experience_outbound_clicks?: string;
  
  // ===== CATALOG & DYNAMIC ADS =====
  catalog_segment_actions?: Array<{ action_type: string; value: string }>;
  catalog_segment_value?: Array<{ action_type: string; value: string }>;
  catalog_segment_value_mobile_purchase_roas?: Array<{ action_type: string; value: string }>;
  catalog_segment_value_website_purchase_roas?: Array<{ action_type: string; value: string }>;
  
  // ===== COST METRICS =====
  cost_per_estimated_ad_recallers?: string;
  cost_per_thruplay?: Array<{ action_type: string; value: string }>;
  cost_per_2_sec_continuous_video_view?: Array<{ action_type: string; value: string }>;
  
  // ===== BRAND AWARENESS & REACH =====
  estimated_ad_recall_rate?: string;
  estimated_ad_recallers?: string;
  
  // ===== FULL FUNNEL METRICS =====
  full_view_impressions?: string;
  full_view_reach?: string;
  
  // ===== DATE RANGE =====
  date_start: string;
  date_stop: string;
}

// ===== Enriched Ad Types =====
export interface EnrichedAd {
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  ad_id: string;
  ad_name: string;
  creative: {
    id: string | null;
    name: string | null;
    primary_text: string | null;
    headline: string | null;
    raw: any;
  } | null;
  lead_form: {
    id: string;
    name: string;
  } | null;
  insights: {
    // Campaign Settings
    objective?: string;
    optimization_goal?: string;
    buying_type?: string;
    attribution_setting?: string;
    account_currency?: string;
    
    // Basic Metrics
    impressions: number;
    reach: number;
    frequency: number;
    clicks: number;
    unique_clicks: number;
    ctr: number;
    unique_ctr: number;
    cpc: number;
    cpm: number;
    cpp: number;
    
    // Spend & Cost
    spend: number;
    social_spend?: number;
    
    // Link Clicks & CTR (Extended)
    inline_link_clicks?: number;
    outbound_clicks?: number;
    unique_outbound_clicks?: number;
    inline_link_click_ctr?: number;
    unique_inline_link_click_ctr?: number;
    cost_per_inline_link_click?: number;
    cost_per_unique_inline_link_click?: number;
    unique_link_clicks_ctr?: number;
    outbound_clicks_ctr?: number;
    unique_outbound_clicks_ctr?: number;
    cost_per_outbound_click?: number;
    cost_per_unique_outbound_click?: number;
    
    // Engagement Metrics
    inline_post_engagement?: number;
    cost_per_inline_post_engagement?: number;
    post_engagement: number;
    post_reactions: number;
    post_comments?: number;
    post_saves: number;
    post_shares: number;
    page_engagement: number;
    link_clicks: number;
    
    // Quality & Delivery Rankings
    quality_ranking?: string;
    engagement_rate_ranking?: string;
    conversion_rate_ranking?: string;
    delivery?: string;
    
    // Video Metrics
    video_views: number;
    video_views_p25: number;
    video_views_p50: number;
    video_views_p75: number;
    video_views_p100: number;
    video_avg_time_watched: number;
    video_play_actions: number;
    video_continuous_2_sec_watched?: number;
    video_thruplay_watched?: number;
    cost_per_thruplay?: number;
    cost_per_2_sec_continuous_video_view?: number;
    
    // Conversion Metrics
    conversions: number;
    conversion_values: number;
    cost_per_conversion: number;
    converted_product_quantity?: number;
    converted_product_value?: number;
    
    // Landing Page & Website
    landing_page_views?: number;
    cost_per_landing_page_view?: number;
    website_ctr?: number;
    offsite_conversions?: number;
    
    // Mobile App
    mobile_app_purchase_roas?: number;
    website_purchase_roas?: number;
    purchase_roas?: number;
    app_store_clicks?: number;
    deeplink_clicks?: number;
    
    // Instant Experience (Canvas)
    canvas_avg_view_percent?: number;
    canvas_avg_view_time?: number;
    instant_experience_clicks_to_open?: number;
    instant_experience_clicks_to_start?: number;
    instant_experience_outbound_clicks?: number;
    
    // Catalog & Dynamic Ads
    catalog_segment_actions?: number;
    catalog_segment_value?: number;
    catalog_segment_value_mobile_purchase_roas?: number;
    catalog_segment_value_website_purchase_roas?: number;
    
    // Brand Awareness
    estimated_ad_recall_rate?: number;
    estimated_ad_recallers?: number;
    cost_per_estimated_ad_recaller?: number;
    
    // Store Traffic
    store_visit_actions?: number;
    cost_per_store_visit_action?: number;
    
    // Full Funnel Metrics
    full_view_impressions?: number;
    full_view_reach?: number;
    
    // E-commerce Actions
    purchases?: number;
    add_to_cart?: number;
    initiate_checkout?: number;
    view_content?: number;
    search?: number;
    add_payment_info?: number;
    complete_registration?: number;
    contact?: number;
    customize_product?: number;
    donate?: number;
    find_location?: number;
    schedule?: number;
    start_trial?: number;
    submit_application?: number;
    subscribe?: number;
    
    // Lead Metrics
    leads: number;
    cost_per_lead: number;
    
    // Date Range
    date_start: string;
    date_stop: string;
  };
}

export interface WeeklyMetaSpend {
  startDate: string;
  endDate: string;
  spend: number;
  impressions: number;
  clicks: number;
  adAccountId: string;
}

// ===== Save Weekly Analytics Types =====
export interface SaveWeeklyAnalyticsParams {
  clientId: string;
  adAccountId: string;
  startDate: string;
  endDate: string;
  accessToken: string;
}

export interface SaveResult {
  savedCount: number;
  weeksSaved: number;
  dateRange: {
    start: string;
    end: string;
  };
  errors: any[];
}

// ===== Ad Performance Board Types =====
export interface BoardFilters {
  campaignName?: string | string[];
  adSetName?: string | string[];
  adName?: string | string[];
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  estimateSetLeads?: boolean;
  jobBookedLeads?: boolean;
  zipCode?: string | string[];
  serviceType?: string | string[];
  leadScore?: {
    min?: number;
    max?: number;
  };
}

export interface BoardColumns {
  campaignName?: boolean;
  adSetName?: boolean;
  adName?: boolean;
  service?: boolean;
  zipCode?: boolean;
  fb_spend?: boolean;
  fb_impressions?: boolean;
  fb_clicks?: boolean;
  fb_unique_clicks?: boolean;
  fb_reach?: boolean;
  fb_frequency?: boolean;
  fb_ctr?: boolean;
  fb_unique_ctr?: boolean;
  fb_cpc?: boolean;
  fb_cpm?: boolean;
  fb_cpr?: boolean;
  fb_post_engagements?: boolean;
  fb_post_reactions?: boolean;
  fb_post_comments?: boolean;
  fb_post_shares?: boolean;
  fb_post_saves?: boolean;
  fb_page_engagements?: boolean;
  fb_link_clicks?: boolean;
  fb_video_views?: boolean;
  fb_video_views_25pct?: boolean;
  fb_video_views_50pct?: boolean;
  fb_video_views_75pct?: boolean;
  fb_video_views_100pct?: boolean;
  fb_video_avg_watch_time?: boolean;
  fb_video_play_actions?: boolean;
  fb_total_conversions?: boolean;
  fb_conversion_value?: boolean;
  fb_cost_per_conversion?: boolean;
  fb_total_leads?: boolean;
  fb_cost_per_lead?: boolean;
  numberOfLeads?: boolean;
  numberOfEstimateSets?: boolean;
  numberOfJobsBooked?: boolean;
  numberOfUnqualifiedLeads?: boolean;
  costPerLead?: boolean;
  costPerEstimateSet?: boolean;
  costPerJobBooked?: boolean;
  costOfMarketingPercent?: boolean;
  estimateSetRate?: boolean;
  revenue?: boolean;
  thumbstop_rate?: boolean;
  conversion_rate?: boolean;
  see_more_rate?: boolean;
}

export interface BoardRow {
  campaignName?: string;
  adSetName?: string;
  adName?: string;
  service?: string;
  zipCode?: string;
  fb_spend?: number;
  fb_impressions?: number;
  fb_clicks?: number;
  fb_unique_clicks?: number;
  fb_reach?: number;
  fb_frequency?: number;
  fb_ctr?: number;
  fb_unique_ctr?: number;
  fb_cpc?: number;
  fb_cpm?: number;
  fb_cpr?: number;
  fb_post_engagements?: number;
  fb_post_reactions?: number;
  fb_post_comments?: number;
  fb_post_shares?: number;
  fb_post_saves?: number;
  fb_page_engagements?: number;
  fb_link_clicks?: number;
  fb_video_views?: number;
  fb_video_views_25pct?: number;
  fb_video_views_50pct?: number;
  fb_video_views_75pct?: number;
  fb_video_views_100pct?: number;
  fb_video_avg_watch_time?: number;
  fb_video_play_actions?: number;
  fb_total_conversions?: number;
  fb_conversion_value?: number;
  fb_cost_per_conversion?: number;
  fb_total_leads?: number;
  fb_cost_per_lead?: number;
  numberOfLeads?: number;
  numberOfEstimateSets?: number;
  numberOfJobsBooked?: number;
  numberOfUnqualifiedLeads?: number;
  numberOfVirtualQuotes?: number;
  numberOfEstimateCanceled?: number;
  numberOfProposalPresented?: number;
  numberOfJobLost?: number;
  costPerLead?: number | null;
  costPerEstimateSet?: number | null;
  costPerJobBooked?: number | null;
  costOfMarketingPercent?: number | null;
  estimateSetRate?: number | null;
  revenue?: number;
  thumbstop_rate?: number | null;
  conversion_rate?: number | null;
  see_more_rate?: number | null;
  
  _groupKey?: string;
  _totalSpend?: number;
  _totalRevenue?: number;
  _totalImpressions?: number;
  _services?: Set<string>;
  _zipCodes?: Set<string>;
  _totalClicks?: number;
  _totalUniqueClicks?: number;
  _totalReach?: number;
  _totalFrequency?: number;
  _totalCtr?: number;
  _totalUniqueClickThroughRate?: number;
  _totalCostPerClick?: number;
  _totalCostPerThousandImpressions?: number;
  _totalCostPerThousandReach?: number;
  _totalPostEngagements?: number;
  _totalPostReactions?: number;
  _totalPostComments?: number;
  _totalPostShares?: number;
  _totalPostSaves?: number;
  _totalPageEngagements?: number;
  _totalLinkClicks?: number;
  _totalVideoViews?: number;
  _totalVideoViews25?: number;
  _totalVideoViews50?: number;
  _totalVideoViews75?: number;
  _totalVideoViews100?: number;
  _totalVideoAvgWatchTime?: number;
  _totalVideoPlayActions?: number;
  _totalConversions?: number;
  _totalConversionValue?: number;
  _totalCostPerConversion?: number;
  _totalLeads?: number;
  _totalCostPerLead?: number;
  _count?: number;  // Track number of records for averaging
}

export interface BoardParams {
  clientId: string;
  filters: BoardFilters;
  columns: BoardColumns;
  groupBy: 'campaign' | 'adset' | 'ad';
}

export interface BoardResponse {
  rows: BoardRow[];
  averages: {
    fb_frequency: number;
    fb_ctr: number;
    fb_unique_ctr: number;
    fb_cpc: number;
    fb_cpm: number;
    fb_cpr: number;
    fb_cost_per_conversion: number;
    fb_cost_per_lead: number;
    costPerLead: number | null;
    costPerEstimateSet: number | null;
    costPerJobBooked: number | null;
    costOfMarketingPercent: number | null;
    estimateSetRate: number | null;
  };
  availableZipCodes: string[];
  availableServiceTypes: string[];
}
