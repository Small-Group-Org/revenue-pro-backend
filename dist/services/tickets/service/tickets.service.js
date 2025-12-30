import { TicketRepository } from '../repository/ticketRepository.js';
import utils from "../../../utils/utils.js";
export class TicketService {
    constructor() {
        this.ticketRepository = new TicketRepository();
    }
    async createTicket(ticketData) {
        try {
            const { userId, title, description } = ticketData;
            // Validate required fields and content
            if (!userId?.trim() || !title?.trim() || !description?.trim()) {
                throw new Error("userId, title, and description are required and cannot be empty");
            }
            const ticket = await this.ticketRepository.createTicket({
                userId: userId.trim(),
                title: title.trim(),
                description: description.trim(),
                status: 'open',
            });
            if (!ticket) {
                throw new Error("Failed to create ticket");
            }
            return ticket;
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
    async updateTicket(ticketId, updateData) {
        try {
            // Validate ticket ID and check existence
            if (!ticketId?.trim()) {
                throw new Error("Ticket ID is required and cannot be empty");
            }
            const existingTicket = await this.ticketRepository.getTicketById(ticketId);
            if (!existingTicket) {
                throw new Error("Ticket not found");
            }
            // Validate all update data at once
            const validationErrors = [];
            if (updateData.status && !['open', 'in_progress', 'closed'].includes(updateData.status)) {
                validationErrors.push("Status must be one of: open, in_progress, closed");
            }
            if (updateData.priority && !['low', 'medium', 'high'].includes(updateData.priority)) {
                validationErrors.push("Priority must be one of: low, medium, high");
            }
            if (validationErrors.length > 0) {
                throw new Error(validationErrors.join('; '));
            }
            // Build update data
            const filteredUpdateData = {};
            if (updateData.status !== undefined)
                filteredUpdateData.status = updateData.status;
            if (updateData.priority !== undefined)
                filteredUpdateData.priority = updateData.priority;
            const updatedTicket = await this.ticketRepository.updateTicket(ticketId, filteredUpdateData);
            return updatedTicket;
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
    async getTickets(filters = {}) {
        try {
            // Validate all filters at once
            const validationErrors = [];
            if (filters.status && !['open', 'in_progress', 'closed'].includes(filters.status)) {
                validationErrors.push("Status filter must be one of: open, in_progress, closed");
            }
            if (filters.priority && !['low', 'medium', 'high'].includes(filters.priority)) {
                validationErrors.push("Priority filter must be one of: low, medium, high");
            }
            if (filters.userId && filters.userId !== 'all' && !filters.userId.trim()) {
                validationErrors.push("User ID cannot be empty");
            }
            if (validationErrors.length > 0) {
                throw new Error(validationErrors.join('; '));
            }
            // Handle different query scenarios
            if (filters.userId === 'all') {
                return await this.ticketRepository.getAllTickets();
            }
            if (filters.userId) {
                return await this.ticketRepository.getTicketsByUserId(filters.userId);
            }
            return await this.ticketRepository.getTicketsWithFilters(filters);
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
    async getTicketById(ticketId) {
        try {
            if (!ticketId?.trim()) {
                throw new Error("Ticket ID is required and cannot be empty");
            }
            return await this.ticketRepository.getTicketById(ticketId);
        }
        catch (error) {
            throw utils.ThrowableError(error);
        }
    }
}
