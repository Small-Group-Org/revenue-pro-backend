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
    role: string = "",
    googleID: string | null,
    isEmailVerified: boolean,
    imageURL?: string,
  ): Promise<IUser> {
    try {
      return await this.repository.addUser(
        name,
        email,
        username,
        password,
        role,
        googleID,
        isEmailVerified,
        imageURL,
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
}
