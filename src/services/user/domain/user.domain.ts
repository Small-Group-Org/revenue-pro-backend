import { Document } from "mongoose";

export interface IUser extends Document {
  googleID?: string;
  username?: string;
  email: string;
  role: string;
  password?: string;
  imageURL?: string;
  isEmailVerified: boolean;
  name: string;
  created_at: Date;
  updated_at: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}
