import { Request, Response } from "express";
import { TicketService } from "../services/tickets/service/tickets.service.js";
import utils from "../utils/utils.js";

export class TicketController {
  private ticketService: TicketService;

  constructor() {
    this.ticketService = new TicketService();
  }

  // POST /api/v1/tickets - Create a new ticket
  async createTicket(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.context.getUserId();
      const { title, description } = req.body;

      if (!title || !description) {
        utils.sendErrorResponse(res, "Title and description are required");
        return;
      }

      const ticket = await this.ticketService.createTicket({
        userId,
        title,
        description
      });

      utils.sendSuccessResponse(res, 201, {
        success: true,
        message: "Ticket created successfully",
        data: ticket
      });
    } catch (error) {
      console.error("Error creating ticket:", error);
      utils.sendErrorResponse(res, error);
    }
  }

  // PUT /api/v1/tickets/:id - Update a ticket
  async updateTicket(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status, priority } = req.body;

      const updatedTicket = await this.ticketService.updateTicket(id, {
        status,
        priority
      });

      if (!updatedTicket) {
        utils.sendErrorResponse(res, "Ticket not found");
        return;
      }

      utils.sendSuccessResponse(res, 200, {
        success: true,
        message: "Ticket updated successfully",
        data: updatedTicket
      });
    } catch (error) {
      console.error("Error updating ticket:", error);
      utils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/tickets - Get tickets with optional filters
  async getTickets(req: Request, res: Response): Promise<void> {
    try {
      const currentUserId = req.context.getUserId();
      const currentUser = req.context.getUser();

      let userId: string;

      if (currentUser?.role === 'ADMIN') {
          // Admin can see all tickets
          userId = 'all';
        } else {
          // Regular users can only see their own tickets
          userId = currentUserId;
        }
      

      const tickets = await this.ticketService.getTickets({
        userId
      });

      utils.sendSuccessResponse(res, 200, {
        success: true,
        data: tickets,
        count: tickets.length
      });
    } catch (error) {
      console.error("Error fetching tickets:", error);
      utils.sendErrorResponse(res, error);
    }
  }
}
