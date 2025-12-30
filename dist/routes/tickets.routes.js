import { Router } from 'express';
import { TicketController } from '../controllers/ticketController.js';
const router = Router();
const ticketController = new TicketController();
// Create a new ticket
router.post('/', ticketController.createTicket.bind(ticketController));
// Get tickets with optional filters
router.get('/', ticketController.getTickets.bind(ticketController));
// Update a ticket
router.put('/:id', ticketController.updateTicket.bind(ticketController));
export default router;
