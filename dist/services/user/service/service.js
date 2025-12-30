import { CustomError, ErrorCode } from "../../../pkg/error/custom_error.js";
import utils from "../../../utils/utils.js";
import { UserRepositoryService } from "../repository/repository.js";
export default class UserService {
    constructor() {
        this.repository = new UserRepositoryService();
    }
    async addUser(name, email, username, password, role = "USER", isEmailVerified, imageURL) {
        try {
            const existingUser = await this.getUserByEmail(email);
            if (existingUser) {
                throw new CustomError(ErrorCode.CONFLICT, "User with this email already exists");
            }
            return await this.repository.addUser(name, email, username, password, role, isEmailVerified, imageURL);
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
    async getUserByEmail(email) {
        try {
            if (!email) {
                throw new CustomError(ErrorCode.INVALID_INPUT, "empty email");
            }
            return await this.repository.getUserByEmail(email);
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
    async getUserById(id) {
        try {
            if (!id) {
                throw new CustomError(ErrorCode.INVALID_INPUT, "empty id");
            }
            return await this.repository.getUserById(id);
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
    async getUserByIdIncludeInactive(id) {
        try {
            if (!id) {
                throw new CustomError(ErrorCode.INVALID_INPUT, "empty id");
            }
            return await this.repository.getUserByIdIncludeInactive(id);
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
    async updateUserPassword(id, password) {
        try {
            if (!id || !password) {
                throw new CustomError(ErrorCode.INVALID_INPUT, "ID and password are required");
            }
            return await this.repository.updateUserPassword(id, password);
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
    async getAllUsers(role) {
        try {
            return await this.repository.getAllUsers(role);
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
    async updateUserDetails(userId, updateData) {
        const updatedUser = await this.repository.updateUser(userId, updateData);
        if (!updatedUser) {
            throw new CustomError(ErrorCode.NOT_FOUND, "User not found");
        }
        return updatedUser;
    }
    async upsertUser(userData) {
        try {
            const { userId, email, password, name, role, status, isEmailVerified } = userData;
            // If userId is provided, update the user
            if (userId) {
                return await this.updateUserDetails(userId, { name, email, role, status, isEmailVerified });
            }
            // If no userId is provided, create a new user
            if (!password) {
                throw new CustomError(ErrorCode.INVALID_INPUT, "Password is required for new users");
            }
            return await this.addUser(name, email, email, // using email as username
            password, role, isEmailVerified);
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
    async updateUserLoginStatus(userId, hasLoggedIn) {
        try {
            if (!userId) {
                throw new CustomError(ErrorCode.INVALID_INPUT, "User ID is required");
            }
            const updatedUser = await this.repository.updateUser(userId, { hasLoggedIn });
            if (!updatedUser) {
                throw new CustomError(ErrorCode.NOT_FOUND, "User not found");
            }
            return updatedUser;
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
    async updateLastAccessAt(userId) {
        try {
            if (!userId) {
                throw new CustomError(ErrorCode.INVALID_INPUT, "User ID is required");
            }
            const updatedUser = await this.repository.updateLastAccessAt(userId);
            if (!updatedUser) {
                throw new CustomError(ErrorCode.NOT_FOUND, "User not found");
            }
            return updatedUser;
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
    async markUpdateAsSeen(userId) {
        try {
            if (!userId) {
                throw new CustomError(ErrorCode.INVALID_INPUT, "User ID is required");
            }
            const updatedUser = await this.repository.updateUser(userId, {
                hasSeenLatestUpdate: true
            });
            if (!updatedUser) {
                throw new CustomError(ErrorCode.NOT_FOUND, "User not found");
            }
            return updatedUser;
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
    async updateUser(userId, updateData) {
        try {
            if (!userId) {
                throw new CustomError(ErrorCode.INVALID_INPUT, "User ID is required");
            }
            return await this.repository.updateUser(userId, updateData);
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
    async deleteUser(userId) {
        await this.repository.deleteUser(userId);
    }
    async updateFbAdAccountId(userId, fbAdAccountId, fbPixelId, fbPixelToken) {
        try {
            if (!userId) {
                throw new CustomError(ErrorCode.INVALID_INPUT, "User ID is required");
            }
            if (!fbAdAccountId) {
                throw new CustomError(ErrorCode.INVALID_INPUT, "Facebook Ad Account ID is required");
            }
            const updateData = { fbAdAccountId };
            if (fbPixelId && fbPixelToken) {
                updateData.fbPixelId = fbPixelId;
                updateData.fbPixelToken = fbPixelToken;
            }
            const updatedUser = await this.repository.updateUser(userId, updateData);
            if (!updatedUser) {
                throw new CustomError(ErrorCode.NOT_FOUND, "User not found");
            }
            return updatedUser;
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
}
