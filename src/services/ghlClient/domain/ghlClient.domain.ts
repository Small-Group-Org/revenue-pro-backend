import { Document } from "mongoose";

export interface IGhlClient extends Document {
  locationId: string;
  encryptedApiToken: string;
  queryValue: string;
  customFieldId?: string;
  queryValue2?: string;
  customFieldId2?: string;
  // Tag-based date custom field IDs
  apptBookedTagDateFieldId?: string;
  jobWonTagDateFieldId?: string;
  jobLostTagDateFieldId?: string;
  apptCompletedTagDateFieldId?: string;
  disqualifiedTagDateFieldId?: string;
  pipelineId: string;
  revenueProClientId: string;
  status?: 'active' | 'deleted' | 'inactive';
  deletedAt?: Date;
  created_at: Date;
  updated_at: Date;
}

