import { Document } from "mongoose";

export interface ICreative {
  // Identity
  creativeId: string;
  adAccountId: string;
  name: string | null;
  
  // Content
  primaryText: string | null;
  headline: string | null;
  description: string | null;
  body: string | null;
  
  // Media Assets
  thumbnailUrl: string | null;
  imageUrl: string | null;
  imageHash: string | null;
  videoId: string | null;
  
  // Images Array (for carousels or multiple images)
  images: Array<{
    url: string;
    hash: string;
    width?: number;
    height?: number;
  }>;
  
  // Videos Array
  videos: Array<{
    id: string;
    url: string;
    thumbnailUrl: string;
    duration?: number;
  }>;
  
  // Carousel/Multi-Image Ads
  childAttachments: Array<{
    name: string;
    description: string;
    imageUrl: string;
    imageHash?: string;
    link: string;
    videoId?: string;
  }>;
  
  // Call to Action
  callToAction: {
    type: string;
    value: any;
  } | null;
  
  // Creative Type
  creativeType: 'image' | 'video' | 'carousel' | 'link' | 'other';
  
  // Object Story Spec (Facebook's creative structure)
  objectStorySpec: any;
  
  // Full API Response (for reference)
  rawData: any;
  
  // Metadata
  lastFetchedAt: Date;
  isDeleted: boolean;
  deletedAt: Date | null;
}

export interface ICreativeDocument extends ICreative, Document {
  createdAt: Date;
  updatedAt: Date;
}
