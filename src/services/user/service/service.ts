import { CustomError, ErrorCode } from "../../../pkg/error/custom_error.js";
import { IUser } from "../domain/user.domain.js";
import utils from "../../../utils/utils.js";
import { UserRepositoryService } from "../repository/repository.js";

export default class UserService {
  private repository: UserRepositoryService;

  constructor() {
    this.repository = new UserRepositoryService();
  }

  async addUser(
    name: string,
    email: string,
    username: string,
    password: string | null,
    role: string = "USER",
    isEmailVerified: boolean,
    imageURL?: string,
  ): Promise<IUser> {
    try {

      const existingUser = await this.getUserByEmail(email);
      if (existingUser) {
        throw new CustomError(ErrorCode.CONFLICT, "User with this email already exists");
      }
      return await this.repository.addUser(
        name,
        email,
        username,
        password,
        role,
        isEmailVerified,
        imageURL
      );
    } catch (error) {
      throw utils.ThrowableError(error);
    }
  }

  async getUserByEmail(email: string): Promise<IUser | null> {
    try {
      if (!email) {
        throw new CustomError(ErrorCode.INVALID_INPUT, "empty email");
      }
      return await this.repository.getUserByEmail(email);
    } catch (error) {
      throw utils.ThrowableError(error);
    }
  }

  async getUserById(id: string): Promise<IUser | null> {
    try {
      if (!id) {
        throw new CustomError(ErrorCode.INVALID_INPUT, "empty id");
      }
      return await this.repository.getUserById(id);
    } catch (error) {
      throw utils.ThrowableError(error);
    }
  }

  async getUserByIdIncludeInactive(id: string): Promise<IUser | null> {
    try {
      if (!id) {
        throw new CustomError(ErrorCode.INVALID_INPUT, "empty id");
      }
      return await this.repository.getUserByIdIncludeInactive(id);
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
      return await this.repository.updateUserPassword(id, password);
    } catch (error) {
      throw utils.ThrowableError(error);
    }
  }

  async getAllUsers(role: string): Promise<IUser[]> {
    try {
      return await this.repository.getAllUsers(role);
    } catch (error) {
      throw utils.ThrowableError(error);
    }
  }

  async updateUserDetails(userId: string, updateData: {
    name: string;
    email: string;
    role: string;
    status?: 'active' | 'inactive';
    isEmailVerified: boolean;
    hasLoggedIn?: boolean;
  }): Promise<IUser> {
    const updatedUser = await this.repository.updateUser(userId, updateData);

    if (!updatedUser) {
      throw new CustomError(ErrorCode.NOT_FOUND, "User not found");
    }

    return updatedUser;
  }

  async upsertUser(userData: {
    userId?: string;
    email: string;
    password?: string;
    name: string;
    role: string;
    status?: 'active' | 'inactive';
    isEmailVerified: boolean;
  }): Promise<IUser> {
    try {
      const { userId, email, password, name, role, status, isEmailVerified } = userData;

      // If userId is provided, update the user
      if (userId) {
        return await this.updateUserDetails(userId, { name, email, role, status, isEmailVerified });
      }

      // If no userId is provided, create a new user
      if (!password) {
        throw new CustomError(
          ErrorCode.INVALID_INPUT,
          "Password is required for new users"
        );
      }

      return await this.addUser(
        name,
        email,
        email, // using email as username
        password,
        role,
        isEmailVerified
      );
    } catch (error) {
      throw utils.ThrowableError(error);
    }
  }

  async updateUserLoginStatus(userId: string, hasLoggedIn: boolean): Promise<IUser> {
    try {
      if (!userId) {
        throw new CustomError(ErrorCode.INVALID_INPUT, "User ID is required");
      }
      
      const updatedUser = await this.repository.updateUser(userId, { hasLoggedIn });
      
      if (!updatedUser) {
        throw new CustomError(ErrorCode.NOT_FOUND, "User not found");
      }
      
      return updatedUser;
    } catch (error) {
      throw utils.ThrowableError(error);
    }
  }
  
  async updateLastAccessAt(userId: string): Promise<IUser> {
    try {
      if (!userId) {
        throw new CustomError(ErrorCode.INVALID_INPUT, "User ID is required");
      }

      const updatedUser = await this.repository.updateLastAccessAt(userId);

      if (!updatedUser) {
        throw new CustomError(ErrorCode.NOT_FOUND, "User not found");
      }

      return updatedUser;
    } catch (error) {
      throw utils.ThrowableError(error);
    }
  }

  async deleteUser(userId: string): Promise<void> {
    await this.repository.deleteUser(userId);
  }
}
