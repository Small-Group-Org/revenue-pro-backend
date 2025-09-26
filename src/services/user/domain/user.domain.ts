import { Document } from "mongoose";

export interface IUser extends Document {
  username?: string;
  email: string;
  role: string;
  password?: string;
  imageURL?: string;
  isEmailVerified: boolean;
  hasLoggedIn: boolean;
  name: string;
  leadSheetUrl?: string;
  status?: 'active' | 'deleted' | "inactive";
  deletedAt?: Date;
  created_at: Date;
  updated_at: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}
