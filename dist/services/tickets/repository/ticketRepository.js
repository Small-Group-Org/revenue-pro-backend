import Ticket from './models/tickets.model.js';
export class TicketRepository {
    constructor() {
        this.model = Ticket;
    }
    async createTicket(ticketData) {
        const ticket = new this.model(ticketData);
        const savedTicket = await ticket.save();
        return await this.model.findById(savedTicket._id).populate('userId', 'name email');
    }
    async updateTicket(ticketId, updateData) {
        return await this.model.findByIdAndUpdate(ticketId, { $set: updateData }, { new: true }).populate('userId', 'name email');
    }
    async getTicketById(ticketId) {
        return await this.model.findById(ticketId).populate('userId', 'name email');
    }
    async getTicketsByUserId(userId) {
        return await this.model
            .find({ userId })
            .populate('userId', 'name email')
            .sort({ updatedAt: -1 });
    }
    async getAllTickets() {
        return await this.model
            .find({})
            .populate('userId', 'name email')
            .sort({ updatedAt: -1 });
    }
    async getTicketsWithFilters(filters) {
        const query = {};
        if (filters.userId)
            query.userId = filters.userId;
        if (filters.status)
            query.status = filters.status;
        if (filters.priority)
            query.priority = filters.priority;
        return await this.model
            .find(query)
            .populate('userId', 'name email')
            .sort({ createdAt: -1 });
    }
}
