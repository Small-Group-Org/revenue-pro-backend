import { Document } from "mongoose";

export interface IFbWeeklyAnalytics {
  // Client & Account Info
  clientId: string;
  facebookAdAccountId: string;
  
  // Campaign Hierarchy (Readable Names)
  campaignId: string;
  campaignName: string;
  adSetId: string;
  adSetName: string;
  adId: string;
  adName: string;
  
  // Creative Content
  creative: {
    raw: null;
    id: string | null;
    name: string | null;
    primaryText: string | null;
    headline: string | null;
    rawData: any;
  } | null;
  
  // Lead Form (if applicable)
  leadForm: {
    id: string;
    name: string;
  } | null;
  
  // Campaign Settings & Info
  objective?: string;
  optimizationGoal?: string;
  buyingType?: string;
  attributionSetting?: string;
  accountCurrency?: string;
  
  // Performance Metrics
  metrics: {
    // Basic Performance
    impressions: number;
    reach: number;
    frequency: number;
    clicks: number;
    unique_clicks: number;
    ctr: number;
    unique_ctr: number;
    
    // Costs
    spend: number;
    social_spend: number;
    cpc: number;
    cpm: number;
    cpr: number;
    
    // Link Clicks & CTR (Extended)
    inline_link_clicks: number;
    outbound_clicks: number;
    unique_outbound_clicks: number;
    inline_link_click_ctr: number;
    unique_inline_link_click_ctr: number;
    cost_per_inline_link_click: number;
    cost_per_unique_inline_link_click: number;
    unique_link_clicks_ctr: number;
    outbound_clicks_ctr: number;
    unique_outbound_clicks_ctr: number;
    cost_per_outbound_click: number;
    cost_per_unique_outbound_click: number;
    
    // Engagement (Complete)
    inline_post_engagement: number;
    cost_per_inline_post_engagement: number;
    post_engagements: number;
    post_reactions: number;
    post_comments: number;
    post_saves: number;
    post_shares: number;
    page_engagements: number;
    link_clicks: number;
    
    // Quality & Delivery Rankings
    quality_ranking?: string;
    engagement_rate_ranking?: string;
    conversion_rate_ranking?: string;
    delivery?: string;
    
    // Video Performance (Complete)
    video_views: number;
    video_views_25pct: number;
    video_views_50pct: number;
    video_views_75pct: number;
    video_views_100pct: number;
    video_avg_watch_time: number;
    video_play_actions: number;
    video_continuous_2_sec_watched: number;
    video_thruplay_watched: number;
    cost_per_thruplay: number;
    cost_per_2_sec_continuous_video_view: number;
    
    // Conversions (Extended)
    total_conversions: number;
    conversion_value: number;
    cost_per_conversion: number;
    converted_product_quantity: number;
    converted_product_value: number;
    
    // Landing Page & Website
    landing_page_views: number;
    cost_per_landing_page_view: number;
    website_ctr: number;
    offsite_conversions: number;
    
    // Mobile App
    mobile_app_purchase_roas: number;
    website_purchase_roas: number;
    purchase_roas: number;
    app_store_clicks: number;
    deeplink_clicks: number;
    
    // Instant Experience (Canvas)
    canvas_avg_view_percent: number;
    canvas_avg_view_time: number;
    instant_experience_clicks_to_open: number;
    instant_experience_clicks_to_start: number;
    instant_experience_outbound_clicks: number;
    
    // Catalog & Dynamic Ads
    catalog_segment_actions: number;
    catalog_segment_value: number;
    catalog_segment_value_mobile_purchase_roas: number;
    catalog_segment_value_website_purchase_roas: number;
    
    // Brand Awareness
    estimated_ad_recall_rate: number;
    estimated_ad_recallers: number;
    cost_per_estimated_ad_recaller: number;
    
    // Store Traffic
    store_visit_actions: number;
    cost_per_store_visit_action: number;
    
    // Full Funnel Metrics
    full_view_impressions: number;
    full_view_reach: number;
    
    // E-commerce Actions (from actions array)
    purchases: number;
    add_to_cart: number;
    initiate_checkout: number;
    view_content: number;
    search: number;
    add_payment_info: number;
    complete_registration: number;
    contact: number;
    customize_product: number;
    donate: number;
    find_location: number;
    schedule: number;
    start_trial: number;
    submit_application: number;
    subscribe: number;
    
    // Leads
    total_leads: number;
    cost_per_lead: number;
  };
  
  // Week Period (Always weekly regardless of query)
  weekStartDate: string; // YYYY-MM-DD format
  weekEndDate: string;   // YYYY-MM-DD format
  
  // Metadata
  savedAt: Date;
  dataSource: 'facebook_api' | 'manual_upload';
  isDeleted: boolean;
  deletedAt: Date | null;
}

export interface IFbWeeklyAnalyticsDocument extends IFbWeeklyAnalytics, Document {
  _id: string;
  createdAt: Date;
  updatedAt: Date;
}
