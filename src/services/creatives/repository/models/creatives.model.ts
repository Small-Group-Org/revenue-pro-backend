import { Schema, model } from 'mongoose';
import { ICreativeDocument } from '../../domain/creatives.domain.js';

const creativesSchema = new Schema<ICreativeDocument>(
  {
    // Identity
    creativeId: { type: String, required: true, unique: true, index: true },
    adAccountId: { type: String, required: true, index: true },
    name: { type: String, default: null },
    
    // Content
    primaryText: { type: String, default: null },
    headline: { type: String, default: null },
    description: { type: String, default: null },
    body: { type: String, default: null },
    
    // Media Assets
    thumbnailUrl: { type: String, default: null },
    imageUrl: { type: String, default: null },
    imageHash: { type: String, default: null },
    videoId: { type: String, default: null },
    
    // Images Array (for carousels or multiple images)
    images: {
      type: [{
        url: { type: String },
        hash: { type: String },
        width: { type: Number },
        height: { type: Number }
      }],
      default: []
    },
    
    // Videos Array
    videos: {
      type: [{
        id: { type: String },
        url: { type: String },
        thumbnailUrl: { type: String },
        duration: { type: Number }
      }],
      default: []
    },
    
    // Carousel/Multi-Image Ads
    childAttachments: {
      type: [{
        name: { type: String },
        description: { type: String },
        imageUrl: { type: String },
        imageHash: { type: String },
        link: { type: String },
        videoId: { type: String }
      }],
      default: []
    },
    
    // Call to Action
    callToAction: { 
      type: Schema.Types.Mixed, 
      default: null 
    },
    
    // Creative Type
    creativeType: { 
      type: String, 
      enum: ['image', 'video', 'carousel', 'link', 'other'],
      default: 'other'
    },
    
    // Object Story Spec (Facebook's creative structure)
    objectStorySpec: { type: Schema.Types.Mixed, default: null },
    
    // Full API Response (for reference)
    rawData: { type: Schema.Types.Mixed, default: null },
    
    // Metadata
    lastFetchedAt: { type: Date, default: Date.now },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null }
  },
  { 
    timestamps: true,
    collection: 'creatives'
  }
);

// Indexes for efficient queries
creativesSchema.index({ adAccountId: 1, creativeId: 1 });
creativesSchema.index({ lastFetchedAt: 1 });

const CreativeModel = model<ICreativeDocument>('Creative', creativesSchema);

export default CreativeModel;
