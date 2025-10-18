import { Request, Response } from "express";
import { TicketService } from "../services/tickets/service/tickets.service.js";
import utils from "../utils/utils.js";

export class TicketController {
  private ticketService: TicketService;

  constructor() {
    this.ticketService = new TicketService();
  }

  private getStringQueryParam(param: unknown): string | undefined {
    if (typeof param === "string") return param;
    if (Array.isArray(param)) {
      const first = param[0];
      return typeof first === "string" ? first : undefined;
    }
    return undefined;
  }

  // POST /api/v1/tickets - Create a new ticket
  async createTicket(req: Request, res: Response): Promise<void> {
    try {
      const { userId, title, description } = req.body;

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
      const rawUserId = req.query.userId;
      const userId = this.getStringQueryParam(rawUserId);

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
