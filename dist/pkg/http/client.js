import axios from "axios";
import { ErrorCode } from "../error/custom_error.js";
import utils from "../../utils/utils.js";
class http {
    constructor(baseURL, timeout = 5000) {
        this.instance = axios.create({
            baseURL,
            timeout,
            headers: {
                "Content-Type": "application/json",
            },
        });
        // Add response interceptor for error handling
        this.instance.interceptors.response.use((response) => response, (error) => {
            if (error.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                throw utils.ThrowableError(`HTTP Error: ${error.response.status} - ${error.response.data?.message || error.message}`, ErrorCode.INTERNAL_SERVER_ERROR);
            }
            else if (error.request) {
                // The request was made but no response was received
                throw utils.ThrowableError("No response received from server", ErrorCode.INTERNAL_SERVER_ERROR);
            }
            else {
                // Something happened in setting up the request that triggered an Error
                throw utils.ThrowableError(`Request setup error: ${error.message}`, ErrorCode.INTERNAL_SERVER_ERROR);
            }
        });
    }
    async get(url, config) {
        try {
            const response = await this.instance.get(url, config);
            return response.data;
        }
        catch (error) {
            throw utils.ThrowableError(`GET request failed: ${error}`, ErrorCode.INTERNAL_SERVER_ERROR);
        }
    }
    async post(url, data, config) {
        try {
            const response = await this.instance.post(url, data, config);
            return response.data;
        }
        catch (error) {
            throw utils.ThrowableError(`POST request failed: ${error}`, ErrorCode.INTERNAL_SERVER_ERROR);
        }
    }
}
export default http;
