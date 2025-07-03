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
    googleID: string | null,
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
        googleID,
        isEmailVerified,
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
      await User.findByIdAndUpdate(id, { password });
    } catch (error) {
      throw utils.ThrowableError(error);
    }
  }
}
