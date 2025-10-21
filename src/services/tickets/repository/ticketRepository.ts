import Ticket from './models/tickets.model.js';
import { ITicket, ITicketDocument } from '../domain/tickets.domain.js';

export class TicketRepository {
  private model: typeof Ticket;

  constructor() {
    this.model = Ticket;
  }

  async createTicket(ticketData: Partial<ITicket>): Promise<ITicketDocument | null> {
    const ticket = new this.model(ticketData);
    const savedTicket = await ticket.save();
    return await this.model.findById(savedTicket._id).populate('userId', 'name email');
  }

  async updateTicket(
    ticketId: string, 
    updateData: Partial<ITicket>
  ): Promise<ITicketDocument | null> {
    return await this.model.findByIdAndUpdate(
      ticketId,
      { $set: updateData },
      { new: true }
    ).populate('userId', 'name email');
  }

  async getTicketById(ticketId: string): Promise<ITicketDocument | null> {
    return await this.model.findById(ticketId).populate('userId', 'name email');
  }

  async getTicketsByUserId(userId: string): Promise<ITicketDocument[]> {
    return await this.model
      .find({ userId })
      .populate('userId', 'name email')
      .sort({ updatedAt: -1 });
  }

  async getAllTickets(): Promise<ITicketDocument[]> {
    return await this.model
      .find({})
      .populate('userId', 'name email')
      .sort({ updatedAt: -1 });
  }

  async getTicketsWithFilters(filters: {
    userId?: string;
    status?: string;
    priority?: string;
  }): Promise<ITicketDocument[]> {
    const query: any = {};
    
    if (filters.userId) query.userId = filters.userId;
    if (filters.status) query.status = filters.status;
    if (filters.priority) query.priority = filters.priority;

    return await this.model
      .find(query)
      .populate('userId', 'name email')
      .sort({ createdAt: -1 });
  }
}