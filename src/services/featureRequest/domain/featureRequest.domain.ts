import { Document } from 'mongoose';

export interface IFeatureRequest {
  userId: string;
  userName: string;
  userEmail: string;
  title: string;
  description: string;
  status: 'new' | 'accepted' | 'rejected' | 'information_needed';
}

export interface IFeatureRequestDocument extends IFeatureRequest, Document {
  createdAt: Date;
  updatedAt: Date;
}
