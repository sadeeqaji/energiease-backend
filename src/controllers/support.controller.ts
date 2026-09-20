import { FastifyRequest, FastifyReply } from 'fastify';
import { SupportService } from '@/services/support.service';
import AdminModel from '@/models/admin.model';

export class SupportController {
  private supportService: SupportService;

  constructor() {
    this.supportService = new SupportService();
  }

  private async getAgentName(userId?: string): Promise<string> {
    if (!userId) return 'Support Agent';
    try {
      const admin = await AdminModel.findById(userId).select('firstName lastName').lean();
      if (admin) {
        return `${admin.firstName} ${admin.lastName}`.trim() || 'Support Agent';
      }
    } catch {}
    return 'Support Agent';
  }

  async listTickets(req: FastifyRequest<any>, reply: FastifyReply) {
    try {
      const query = (req.query || {}) as {
        status?: string;
        search?: string;
        page?: number;
        limit?: number;
      };

      const result = await this.supportService.getTickets(query);
      return reply.send({ success: true, ...result });
    } catch (error: any) {
      req.log.error(error, 'Error listing support tickets');
      return reply.status(500).send({ success: false, error: error.message });
    }
  }

  async getTicket(req: FastifyRequest<any>, reply: FastifyReply) {
    const { ticketId } = (req.params || {}) as { ticketId: string };
    try {
      const data = await this.supportService.getTicketDetails(ticketId);
      return reply.send({ success: true, ...data });
    } catch (error: any) {
      req.log.error(error, `Error fetching ticket ${ticketId}`);
      return reply.status(404).send({ success: false, error: error.message });
    }
  }

  async replyTicket(req: FastifyRequest<any>, reply: FastifyReply) {
    const { ticketId } = (req.params || {}) as { ticketId: string };
    const { text } = (req.body || {}) as { text: string };

    try {
      if (!text || !text.trim()) {
        return reply.status(400).send({ success: false, error: 'Reply text is required' });
      }

      const agentName = await this.getAgentName(req.user?.user_id);
      const updatedTicket = await this.supportService.sendAgentReply(
        ticketId,
        agentName,
        text
      );

      return reply.send({
        success: true,
        message: 'Reply sent to customer on WhatsApp',
        ticket: updatedTicket,
      });
    } catch (error: any) {
      req.log.error(error, `Error replying to ticket ${ticketId}`);
      return reply.status(500).send({ success: false, error: error.message });
    }
  }

  async resolveTicket(req: FastifyRequest<any>, reply: FastifyReply) {
    const { ticketId } = (req.params || {}) as { ticketId: string };

    try {
      const agentName = await this.getAgentName(req.user?.user_id);
      const resolved = await this.supportService.resolveTicket(ticketId, agentName);

      return reply.send({
        success: true,
        message: 'Ticket resolved successfully and customer notified',
        ticket: resolved,
      });
    } catch (error: any) {
      req.log.error(error, `Error resolving ticket ${ticketId}`);
      return reply.status(500).send({ success: false, error: error.message });
    }
  }
}
