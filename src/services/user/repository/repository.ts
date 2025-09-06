import { CustomError, ErrorCode } from "../../../pkg/error/custom_error.js";
import { IUser } from "../domain/user.domain.js";
import User from "./models/user.model.js";
import utils from "../../../utils/utils.js";

export class UserRepositoryService {
  async addUser(
    name: string,
    email: string,
    username: string,
    password: string | null,
    role: string = "",
    isEmailVerified: boolean,
    imageURL?: string,
  ): Promise<IUser> {
    try {
      const user = new User({
        name,
        email,
        username,
        password,
        role,
        isEmailVerified,
        hasLoggedIn: false,
        imageURL,
      });
      await user.save();
      return user;
    } catch (error) {
      throw utils.ThrowableError(error);
    }
  }

  async getUserByEmail(email: string): Promise<IUser | null> {
    try {
      if (!email) {
        return null;
      }
      return await User.findOne({ email });
    } catch (error) {
      throw utils.ThrowableError(error);
    }
  }

  async getUserById(id: string): Promise<IUser | null> {
    try {
      if (!id) {
        return null;
      }
      return await User.findById(id);
    } catch (error) {
      throw utils.ThrowableError(error);
    }
  }

  async updateUserPassword(id: string, password: string): Promise<void> {
    try {
      if (!id || !password) {
        throw new CustomError(
          ErrorCode.INVALID_INPUT,
          "ID and password are required",
        );
      }

      const user = await User.findById(id);
      if (!user) {
        throw new CustomError(ErrorCode.NOT_FOUND, "User not found");
      }

      user.password = password;
      await user.save();
    } catch (error) {
      throw utils.ThrowableError(error);
    }
  }

  async getAllUsers(role?: string): Promise<IUser[]> {
    try {
      const query = role ? { role } : {};
      return await User.find(query);
    } catch (error) {
      throw utils.ThrowableError(error);
    }
  }

  async updateUser(userId: string, updateData: {
    name?: string;
    email?: string;
    imageURL?: string;
    role?: string;
    isEmailVerified?: boolean;
    hasLoggedIn?: boolean;
  }): Promise<IUser | null> {
    try {
      if (!userId) {
        throw new CustomError(ErrorCode.INVALID_INPUT, "User ID is required");
      }
      
      const user = await User.findByIdAndUpdate(
        userId,
        { $set: updateData },
        { new: true }
      );

      return user;
    } catch (error) {
      throw utils.ThrowableError(error);
    }
  }

  async findUserByEmail(email: string): Promise<IUser | null> {
    try {
      const user = await User.findOne({ email });
      return user;
    } catch (error) {
      throw utils.ThrowableError(error);
    }
  }

  public async deleteUser(userId: string): Promise<void> {
    await User.findByIdAndDelete(userId);
  }
}
