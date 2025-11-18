import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import utils from "../../../utils/utils.js";
import { createToken, verifyToken } from "../utils/token.js";
import nodemailer from "nodemailer";
import { CustomError, ErrorCode } from "../../../pkg/error/custom_error.js";
import { config } from "../../../config.js";
import UserService from "../../../services/user/service/service.js";
import { Context } from "../../../services/common/domain/context.js";

class AuthService {
  private userService: UserService;

  constructor(userService: UserService) {
    this.userService = userService;
  }

  async login( req: Request): Promise<any | CustomError> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        throw new CustomError(ErrorCode.BAD_REQUEST, "Email and password are required");
      }

      const user = await this.userService.getUserByEmail(email);
      if (!user) {
        throw new CustomError(ErrorCode.BAD_REQUEST, "Invalid credentials");
      }

      if (!user.password) {
        throw new CustomError(ErrorCode.BAD_REQUEST, "Please login with Google");
      }

      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        throw new CustomError(ErrorCode.BAD_REQUEST, "Invalid credentials");
      }      

      const token = createToken({ id: String(user._id), email: user.email });
      return {
        token: token,
        user: user,
      };
    } catch (error) {
      throw utils.ThrowableError(error);
    }
  }

  async register(context: Context, req: Request): Promise<any> {
    try {
      const { name, email, password } = req.body;

      if (!name || !email || !password) {
        throw new CustomError(ErrorCode.BAD_REQUEST, "All fields are required");
      }

      const existingUser = await this.userService.getUserByEmail(email);
      if (existingUser) {
        throw new CustomError(ErrorCode.BAD_REQUEST, "Email already registered");
      }

      const user = await this.userService.addUser(name, email, email, password, "", false);

      const token = createToken({ id: String(user._id), email: user.email });
      return {
        token: token,
        user: user,
      };
    } catch (error) {
      throw utils.ThrowableError(error);
    }
  }

  async verifyToken(context: Context, req: Request): Promise<any> {
    try {
      const accessToken = req.headers.accesstoken;
      const refreshToken = req.headers.refreshtoken;

      if (!accessToken || !refreshToken) {
        throw new CustomError(ErrorCode.UNAUTHORIZED, "Authentication tokens are missing");
      }

      const result = await verifyToken(accessToken.toString(), refreshToken.toString());

      return result;
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError(ErrorCode.INTERNAL_SERVER_ERROR, "Authentication verification failed");
    }
  }

  async forgotPassword(context: Context, req: Request): Promise<any> {
    try {
      const { email } = req.body;

      if (!email) {
        throw new CustomError(ErrorCode.BAD_REQUEST, "Email is required");
      }

      const user = await this.userService.getUserByEmail(email);
      if (!user) {
        throw new CustomError(ErrorCode.BAD_REQUEST, "User not found");
      }

      const resetToken = jwt.sign(
        { id: user._id },
        "", // config.JWT_SECRET as string,
        { expiresIn: "1h" }
      );

      // Send email with reset token
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          // user: config.EM,
          // pass: config.EMAIL_PASS
        },
      });

      const mailOptions = {
        // from: config.EMAIL_USER,
        to: email,
        subject: "Password Reset",
        text: `Click the link to reset your password: ${config.FRONTEND_URL}/reset-password?token=${resetToken}`,
      };

      await transporter.sendMail(mailOptions);
      return {
        message: "Password reset email sent",
      };
    } catch (error) {
      throw utils.ThrowableError(error);
    }
  }

  async resetPassword(context: Context, req: Request): Promise<any> {
    try {
      const { token, password } = req.body;

      if (!token || !password) {
        throw new CustomError(ErrorCode.BAD_REQUEST, "Token and password are required");
        return;
      }

      const decoded = jwt.verify(token, "" /*config.JWT_SECRET as string*/) as {
        id: string;
      };
      const user = await this.userService.getUserById(decoded.id);

      if (!user) {
        throw new CustomError(ErrorCode.NOT_FOUND, "User not found");
      }

      await this.userService.updateUserPassword(String(user._id), password);

      return {
        message: "Password reset successful",
      };
    } catch (error) {
      throw utils.ThrowableError(error);
    }
  }
}

export default AuthService;
