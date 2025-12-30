import mongoose, { Document, Model, Schema } from "mongoose";
import bcrypt from "bcrypt";
import { IUser } from "../../domain/user.domain.js";

export interface IUserModel extends Model<IUser> {
  // Add any static methods here if needed
}

const userSchema = new Schema<IUser, IUserModel>(
  {
    username: String,
    email: {
      type: String,
      required: true,
    },
    password: String,
    imageURL: String,
    role: {
      type: String,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    hasLoggedIn: {
      type: Boolean,
      default: false,
    },
    name: String,
    leadSheetUrl: {
      type: String,
      required: false,
    },
    fbAdAccountId: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      enum: ['active', 'deleted', 'inactive'],
      default: 'active',
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    lastAccessAt: {
      type: Date,
      default: null
    },
    hasSeenLatestUpdate: {
      type: Boolean,
      default: false
    },
    // Meta OAuth fields
    metaAccessToken: {
      type: String,
      required: false,
    },
    metaTokenExpiresAt: {
      type: Date,
      required: false,
    },
    metaTokenType: {
      type: String,
      required: false,
    },
    metaConnectedAt: {
      type: Date,
      required: false,
    },
    // Facebook Pixel fields
    fbPixelId: {
      type: String,
      required: false,
    },
    fbPixelToken: {
      type: String,
      required: false,
    }
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

// Add method to compare password
userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  if (this.password) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

const User = mongoose.model<IUser, IUserModel>("User", userSchema);
export default User;
