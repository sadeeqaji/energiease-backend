import { FastifyInstance } from 'fastify';
import { SupportTicket, ISupportTicket } from '@/models/support-ticket.model';
import Order from '@/models/order.model';
import { WhatsAppService } from '@/services/whatsapp.service';
import {
  SUPPORT_WELCOME_MESSAGE,
  SUPPORT_AGENT_REPLY_MESSAGE,
  SUPPORT_RESOLVED_MESSAGE,
} from '@/constants/whatsapp.flow';
import { formatToWhatsAppPhone } from '@/utils/phoneNumber';

export class SupportService {
  private whatsappService: WhatsAppService;
  private fastify?: FastifyInstance;

  constructor(fastify?: FastifyInstance) {
    this.fastify = fastify;
    this.whatsappService = new WhatsAppService();
  }

  /**
   * Generates a human-friendly ticket reference
   */
  private generateTicketId(): string {
    const random = Math.floor(100000 + Math.random() * 900000);
    return `TKT-${random}`;
  }

  /**
   * Adds a message to an active ticket, or creates a new ticket if none is active.
   */
  async handleIncomingCustomerMessage(
    phone: string,
    text: string
  ): Promise<{ ticket: ISupportTicket; isNew: boolean }> {
    const cleanPhone = formatToWhatsAppPhone(phone);

    // 1. Look for existing unresolved ticket
    let ticket = await SupportTicket.findOne({
      customerPhone: cleanPhone,
      status: { $in: ['open', 'pending_agent', 'pending_customer'] },
    }).sort({ createdAt: -1 });

    let isNew = false;

    if (!ticket) {
      isNew = true;
      const ticketId = this.generateTicketId();

      // Retrieve customer context (last meter and order)
      let meterNo: string | undefined;
      let disco: string | undefined;
      let lastOrderRef: string | undefined;
      let customerName: string | undefined;

      try {
        const lastOrder = await Order.findOne({ customerPhone: cleanPhone })
          .sort({ createdAt: -1 })
          .lean();

        if (lastOrder) {
          lastOrderRef = lastOrder.reference;
          const details = lastOrder.details as any;
          meterNo = details?.meterNo || details?.meterNumber;
          disco = details?.disco;
          customerName = details?.customerName || details?.name;
        }
      } catch (err) {
        console.error('[SupportService] Error fetching customer context:', err);
      }

      ticket = new SupportTicket({
        ticketId,
        customerPhone: cleanPhone,
        customerName: customerName || 'WhatsApp Customer',
        status: 'pending_agent',
        meterNo,
        disco,
        lastOrderRef,
        messages: [
          {
            sender: 'customer',
            senderName: customerName || 'Customer',
            text: text.trim(),
            timestamp: new Date(),
          },
        ],
        lastMessageAt: new Date(),
      });

      await ticket.save();

      // Send greeting to customer on WhatsApp
      await this.whatsappService
        .sendMessage(SUPPORT_WELCOME_MESSAGE(cleanPhone, ticketId) as any)
        .catch((err) => {
          console.error('[SupportService] Failed to send welcome WhatsApp message:', err);
        });
    } else {
      // Append to existing ticket
      ticket.messages.push({
        sender: 'customer',
        senderName: ticket.customerName || 'Customer',
        text: text.trim(),
        timestamp: new Date(),
      });
      ticket.status = 'pending_agent';
      ticket.lastMessageAt = new Date();
      await ticket.save();
    }

    return { ticket, isNew };
  }

  /**
   * Retrieves paginated tickets for the admin support desk
   */
  async getTickets(query: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(50, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter: any = {};

    if (query.status && query.status !== 'all') {
      if (query.status === 'active') {
        filter.status = { $in: ['open', 'pending_agent', 'pending_customer'] };
      } else {
        filter.status = query.status;
      }
    }

    if (query.search) {
      const searchRegex = new RegExp(query.search.trim(), 'i');
      filter.$or = [
        { ticketId: searchRegex },
        { customerPhone: searchRegex },
        { customerName: searchRegex },
        { meterNo: searchRegex },
        { lastOrderRef: searchRegex },
      ];
    }

    const [tickets, total, counts] = await Promise.all([
      SupportTicket.find(filter)
        .sort({ lastMessageAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('assignedTo', 'firstName lastName email')
        .lean(),
      SupportTicket.countDocuments(filter),
      SupportTicket.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const statusCounts = {
      open: 0,
      pending_agent: 0,
      pending_customer: 0,
      resolved: 0,
      totalActive: 0,
    };

    counts.forEach((c) => {
      if (c._id in statusCounts) {
        (statusCounts as any)[c._id] = c.count;
      }
      if (c._id !== 'resolved') {
        statusCounts.totalActive += c.count;
      }
    });

    return {
      tickets,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
      counts: statusCounts,
    };
  }

  /**
   * Retrieves single ticket with full chat history and related order diagnostics
   */
  async getTicketDetails(ticketId: string) {
    const ticket = await SupportTicket.findOne({ ticketId })
      .populate('assignedTo', 'firstName lastName email')
      .lean();

    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }

    // Fetch up to 5 recent orders for this customer to give full fintech context
    let recentOrders: any[] = [];
    try {
      recentOrders = await Order.find({ customerPhone: ticket.customerPhone })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();
    } catch (err) {
      console.error('[SupportService] Error fetching customer orders:', err);
    }

    return {
      ticket,
      customerContext: {
        phone: ticket.customerPhone,
        name: ticket.customerName,
        meterNo: ticket.meterNo,
        disco: ticket.disco,
        recentOrders,
      },
    };
  }

  /**
   * Sends an agent reply to the customer on WhatsApp
   */
  async sendAgentReply(ticketId: string, agentName: string, text: string) {
    const ticket = await SupportTicket.findOne({ ticketId });
    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }

    const trimmedText = text.trim();
    if (!trimmedText) {
      throw new Error('Message cannot be empty');
    }

    ticket.messages.push({
      sender: 'agent',
      senderName: agentName || 'Support Agent',
      text: trimmedText,
      timestamp: new Date(),
    });

    ticket.status = 'pending_customer';
    ticket.lastMessageAt = new Date();
    await ticket.save();

    // Send outgoing WhatsApp message to customer
    try {
      await this.whatsappService.sendMessage(
        SUPPORT_AGENT_REPLY_MESSAGE(ticket.customerPhone, agentName || 'Support Agent', trimmedText) as any
      );
    } catch (err: any) {
      console.error('[SupportService] Failed to dispatch WhatsApp message:', err?.message || err);
    }

    return ticket;
  }

  /**
   * Resolves a ticket and releases the customer WhatsApp session back to automated vending
   */
  async resolveTicket(ticketId: string, agentName?: string) {
    const ticket = await SupportTicket.findOne({ ticketId });
    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }

    ticket.status = 'resolved';
    ticket.messages.push({
      sender: 'system',
      senderName: 'System',
      text: `Ticket resolved by ${agentName || 'Support Agent'}`,
      timestamp: new Date(),
    });
    ticket.lastMessageAt = new Date();
    await ticket.save();

    // Release Redis session if Redis is available
    if (this.fastify?.redis) {
      await this.fastify.redis.del(`support_session:${ticket.customerPhone}`).catch(() => {});
    }

    // Send closing message to WhatsApp customer
    await this.whatsappService
      .sendMessage(SUPPORT_RESOLVED_MESSAGE(ticket.customerPhone, ticket.ticketId) as any)
      .catch((err) => {
        console.error('[SupportService] Failed to send resolution message:', err);
      });

    return ticket;
  }
}
