import { CustomError, ErrorCode } from "../../../pkg/error/custom_error.js";
import User from "./models/user.model.js";
import utils from "../../../utils/utils.js";
export class UserRepositoryService {
    async addUser(name, email, username, password, role = "", isEmailVerified, imageURL) {
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
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
    async getUserByEmail(email) {
        try {
            if (!email) {
                return null;
            }
            return await User.findOne({ email, status: 'active' });
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
    async getUserById(id) {
        try {
            if (!id) {
                return null;
            }
            // Find by id and not deleted
            const user = await User.findOne({ _id: id, status: 'active' });
            return user;
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
    async getUserByIdIncludeInactive(id) {
        try {
            if (!id) {
                return null;
            }
            // Find by id and include both active and inactive users, but not deleted
            const user = await User.findOne({
                _id: id,
                status: { $in: ['active', 'inactive'] }
            });
            return user;
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
            const user = await User.findById(id);
            if (!user) {
                throw new CustomError(ErrorCode.NOT_FOUND, "User not found");
            }
            user.password = password;
            await user.save();
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
    async getAllUsers(role) {
        try {
            const query = { status: { $in: ['active', 'inactive'] } };
            if (role)
                query.role = role;
            return await User.find(query);
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
            const user = await User.findByIdAndUpdate(userId, { $set: updateData }, { new: true });
            return user;
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
    async findUserByEmail(email) {
        try {
            const user = await User.findOne({ email });
            return user;
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
            const updatedUser = await User.findByIdAndUpdate(userId, { $set: { lastAccessAt: new Date() } }, // UTC
            { new: true });
            if (!updatedUser) {
                throw new CustomError(ErrorCode.NOT_FOUND, "User not found");
            }
            return updatedUser;
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
    async deleteUser(userId) {
        // Soft delete: set status to 'deleted' and deletedAt to current date
        await User.findByIdAndUpdate(userId, { $set: { status: 'deleted', deletedAt: Date.now() } });
    }
}
