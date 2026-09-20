import { FastifyInstance } from 'fastify';
import { SupportTicket, ISupportTicket } from '@/models/support-ticket.model';
import Order from '@/models/order.model';
import { WhatsAppService } from '@/services/whatsapp.service';
import {
  SUPPORT_WELCOME_MESSAGE,
  SUPPORT_AGENT_REPLY_MESSAGE,
  SUPPORT_RESOLVED_MESSAGE,
  SUPPORT_INACTIVITY_NUDGE_MESSAGE,
  SUPPORT_AUTO_RESOLVED_MESSAGE,
} from '@/constants/whatsapp.flow';
import { formatToWhatsAppPhone, getPhoneSearchVariants } from '@/utils/phoneNumber';
import { analytics } from '@/services/analytics.service';

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
      analytics.trackSupportTicketOpened(cleanPhone, ticketId, 'customer_inquiry');

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
      ticket.inactivityWarningSentAt = undefined;
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
   * Fetches customer orders matching a phone number (any Nigerian format) and/or meter number
   */
  async fetchOrdersByPhoneOrMeter(phone?: string, meterNo?: string, limit = 15) {
    const orConditions: any[] = [];

    if (phone && phone.trim()) {
      const trimmedPhone = phone.trim();
      const variants = getPhoneSearchVariants(trimmedPhone);
      orConditions.push({ customerPhone: { $in: variants } });

      const digitsOnly = trimmedPhone.replace(/[^0-9]/g, '');
      if (digitsOnly.length >= 9) {
        const last9 = digitsOnly.slice(-9);
        orConditions.push({ customerPhone: new RegExp(`${last9}$`) });
      }
    }

    if (meterNo && meterNo.trim()) {
      const trimmedMeter = meterNo.trim();
      orConditions.push({ 'details.meterNumber': trimmedMeter });
      orConditions.push({ 'details.meterNumber': new RegExp(trimmedMeter, 'i') });
    }

    if (orConditions.length === 0) {
      return [];
    }

    const orders = await Order.find({ $or: orConditions })
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 50))
      .lean();

    return orders.map((o: any) => {
      const d = (o.details || {}) as any;
      const resp = (o.providerResponse || {}) as any;
      const token = resp.token || resp.standardTokenValue || d.token || o.token;

      return {
        id: String(o._id),
        reference: o.reference,
        customerPhone: o.customerPhone,
        type: o.type,
        status: o.status,
        amount: o.amount,
        serviceFee: o.serviceFee,
        disco: d.disco || 'UNKNOWN',
        meterNumber: d.meterNumber || '',
        token: token || undefined,
        units: resp.units || d.units || undefined,
        provider: o.provider,
        providerOrderId: o.providerOrderId,
        requiresManualIntervention: o.requiresManualIntervention || false,
        failureReason: o.failureReason || resp.message || undefined,
        createdAt: o.createdAt,
      };
    });
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

    // Fetch up to 10 recent orders for this customer using multi-format phone lookup
    let recentOrders: any[] = [];
    try {
      recentOrders = await this.fetchOrdersByPhoneOrMeter(ticket.customerPhone, ticket.meterNo, 10);
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
    ticket.inactivityWarningSentAt = undefined;
    await ticket.save();

    analytics.trackSupportReplySent(ticket.ticketId, 'agent', ticket.customerPhone);

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
  async resolveTicket(
    ticketId: string,
    agentName?: string,
    resolutionReason: 'agent' | 'customer_exit' | 'inactivity_timeout' = 'agent'
  ) {
    const ticket = await SupportTicket.findOne({ ticketId });
    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }

    ticket.status = 'resolved';
    ticket.resolutionReason = resolutionReason;
    ticket.messages.push({
      sender: 'system',
      senderName: 'System',
      text: `Ticket resolved by ${agentName || 'Support Agent'} (${resolutionReason})`,
      timestamp: new Date(),
    });
    ticket.lastMessageAt = new Date();
    await ticket.save();

    const totalDurationMins = ticket.createdAt
      ? Math.round((Date.now() - new Date(ticket.createdAt).getTime()) / 60000)
      : undefined;
    analytics.trackSupportTicketResolved(ticket.customerPhone, ticket.ticketId, resolutionReason, totalDurationMins);

    // Release Redis session if Redis is available
    if (this.fastify?.redis) {
      await this.fastify.redis.del(`support_session:${ticket.customerPhone}`).catch(() => {});
    }

    // Send closing message to WhatsApp customer
    await this.whatsappService
      .sendMessage(
        (resolutionReason === 'inactivity_timeout'
          ? SUPPORT_AUTO_RESOLVED_MESSAGE(ticket.customerPhone, ticket.ticketId)
          : SUPPORT_RESOLVED_MESSAGE(ticket.customerPhone, ticket.ticketId)) as any
      )
      .catch((err) => {
        console.error('[SupportService] Failed to send resolution message:', err);
      });

    return ticket;
  }

  /**
   * Automatically creates or escalates an urgent support ticket when a token was vended
   * but Meta WhatsApp delivery failed, so human agents can intervene immediately.
   */
  async createUrgentDeliveryFailureTicket(params: {
    phone: string;
    orderReference: string;
    token: string;
    disco: string;
    meterNumber: string;
    amount: number;
    errorCode: string | number;
    errorMessage: string;
  }) {
    const cleanPhone = formatToWhatsAppPhone(params.phone);
    const ticketId = this.generateTicketId();

    const alertMessage =
      `🚨 URGENT DELIVERY FAILURE: BuyPower successfully vended Token (${params.token}) for Order #${params.orderReference} ` +
      `(₦${params.amount.toLocaleString()} • ${params.disco} • Meter: ${params.meterNumber}), ` +
      `BUT Meta WhatsApp message delivery failed [Error ${params.errorCode}]: ${params.errorMessage}. ` +
      `Please contact the customer immediately via phone call or SMS with their token!`;

    const ticket = await SupportTicket.create({
      ticketId,
      customerPhone: cleanPhone,
      status: 'pending_agent',
      meterNo: params.meterNumber,
      disco: params.disco,
      lastOrderRef: params.orderReference,
      messages: [
        {
          sender: 'system',
          senderName: 'Meta Delivery Monitor',
          text: alertMessage,
          timestamp: new Date(),
        },
      ],
      lastMessageAt: new Date(),
    });

    return ticket;
  }

  /**
   * Scans tickets waiting for customer responses and executes the 15-minute inactivity policy:
   *  - 10 minutes of silence: sends friendly WhatsApp check-in nudge
   *  - 15 minutes of silence: auto-resolves ticket, releases Redis session, and sends closure notification
   */
  async checkAndHandleInactiveTickets(): Promise<{ nudgedCount: number; autoClosedCount: number }> {
    const now = Date.now();
    const NUDGE_AFTER_MS = 10 * 60 * 1000; // 10 minutes
    const CLOSE_AFTER_MS = 15 * 60 * 1000; // 15 minutes total

    // Only inspect tickets where agent already replied and we are waiting on the customer
    const candidateTickets = await SupportTicket.find({
      status: 'pending_customer',
    });

    let nudgedCount = 0;
    let autoClosedCount = 0;

    for (const ticket of candidateTickets) {
      const elapsedSinceLastMsg = now - new Date(ticket.lastMessageAt).getTime();

      // Check if eligible for auto-close (15 mins total silence)
      if (elapsedSinceLastMsg >= CLOSE_AFTER_MS) {
        ticket.status = 'resolved';
        ticket.resolutionReason = 'inactivity_timeout';
        ticket.messages.push({
          sender: 'system',
          senderName: 'System',
          text: 'Ticket auto-closed due to 15 minutes of customer inactivity.',
          timestamp: new Date(),
        });
        ticket.lastMessageAt = new Date();
        await ticket.save();

        if (this.fastify?.redis) {
          await this.fastify.redis.del(`support_session:${ticket.customerPhone}`).catch(() => {});
        }

        try {
          await this.whatsappService.sendMessage(
            SUPPORT_AUTO_RESOLVED_MESSAGE(ticket.customerPhone, ticket.ticketId) as any
          );
        } catch (err: any) {
          console.error('[SupportService] Failed to send auto-resolved message:', err?.message || err);
        }

        autoClosedCount++;
        continue;
      }

      // Check if eligible for 10-min nudge
      if (elapsedSinceLastMsg >= NUDGE_AFTER_MS && !ticket.inactivityWarningSentAt) {
        ticket.inactivityWarningSentAt = new Date();
        ticket.messages.push({
          sender: 'system',
          senderName: 'System',
          text: 'Inactivity check-in nudge sent to customer via WhatsApp.',
          timestamp: new Date(),
        });
        await ticket.save();

        try {
          await this.whatsappService.sendMessage(
            SUPPORT_INACTIVITY_NUDGE_MESSAGE(ticket.customerPhone, ticket.ticketId) as any
          );
        } catch (err: any) {
          console.error('[SupportService] Failed to send inactivity nudge:', err?.message || err);
        }

        nudgedCount++;
      }
    }

    return { nudgedCount, autoClosedCount };
  }
}

