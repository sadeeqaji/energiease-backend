import { FastifyRequest, FastifyReply } from 'fastify';
import adminService from '@/services/admin.service';
import AdminModel from '@/models/admin.model';
import { AppException } from '@/utils/appException.utils';

export class AdminController {
  async getMe(req: FastifyRequest<any>, reply: FastifyReply) {
    try {
      const admin = await AdminModel.findById(req.user.user_id).select('-password').lean();
      if (!admin) {
        throw AppException.NotFound('Admin user not found');
      }
      return reply.send({
        success: true,
        admin: {
          id: admin._id,
          firstName: admin.firstName,
          lastName: admin.lastName,
          email: admin.email,
          role: admin.role,
          permissions: admin.permissions || [],
        },
      });
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
    }
  }

  async getStats(req: FastifyRequest<any>, reply: FastifyReply) {
    try {
      const monnifyService = (req.server as any).monnifyService;
      const stats = await adminService.getDashboardStats(monnifyService);
      return reply.send({ success: true, ...stats });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  }

  async getOrderTrends(req: FastifyRequest<any>, reply: FastifyReply) {
    try {
      const query = (req.query || {}) as { days?: string };
      const days = Number(query.days) || 14;
      const trends = await adminService.getOrderTrends(days);
      return reply.send({ success: true, trends });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  }

  async getDiscoHealth(req: FastifyRequest<any>, reply: FastifyReply) {
    try {
      const health = await adminService.getDiscoHealth();
      return reply.send({ success: true, discos: health });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  }

  async listOrders(req: FastifyRequest<any>, reply: FastifyReply) {
    try {
      const query = (req.query || {}) as {
        page?: string;
        limit?: string;
        search?: string;
        status?: string;
        disco?: string;
        interventionOnly?: string;
        startDate?: string;
        endDate?: string;
      };

      const result = await adminService.listOrders({
        page: query.page ? Number(query.page) : undefined,
        limit: query.limit ? Number(query.limit) : undefined,
        search: query.search,
        status: query.status,
        disco: query.disco,
        interventionOnly: query.interventionOnly === 'true',
        startDate: query.startDate,
        endDate: query.endDate,
      });
      return reply.send({ success: true, ...result });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  }

  async getOrderDetail(req: FastifyRequest<any>, reply: FastifyReply) {
    try {
      const params = (req.params || {}) as { reference: string };
      const order = await adminService.getOrderDetail(params.reference);
      return reply.send({ success: true, order });
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
    }
  }

  async retryVend(req: FastifyRequest<any>, reply: FastifyReply) {
    try {
      const params = (req.params || {}) as { reference: string };
      const orderService = (req.server as any).orderService;
      if (!orderService) {
        throw new Error('OrderService is not initialized on server instance');
      }
      const result = await orderService.retryVendOrder(params.reference);
      return reply.status(result.success ? 200 : 400).send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  }

  async resendToken(req: FastifyRequest<any>, reply: FastifyReply) {
    try {
      const params = (req.params || {}) as { reference: string };
      const result = await adminService.resendTokenViaWhatsApp(params.reference);
      return reply.send(result);
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
    }
  }

  async getAccountingSummary(req: FastifyRequest<any>, reply: FastifyReply) {
    try {
      const monnifyService = (req.server as any).monnifyService;
      const query = (req.query || {}) as { startDate?: string; endDate?: string };
      const result = await adminService.getAccountingSummary(query.startDate, query.endDate, monnifyService);
      return reply.send({ success: true, ...result });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  }

  async exportAccounting(req: FastifyRequest<any>, reply: FastifyReply) {
    try {
      const query = (req.query || {}) as { startDate?: string; endDate?: string };
      const rows = await adminService.exportAccounting(query.startDate, query.endDate);
      return reply.send({ success: true, count: rows.length, data: rows });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  }

  async requeryBuyPower(req: FastifyRequest<any>, reply: FastifyReply) {
    try {
      const params = (req.params || {}) as { reference: string };
      const result = await adminService.requeryBuyPowerOrder(params.reference);
      return reply.send(result);
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
    }
  }

  async verifyMonnifyPayment(req: FastifyRequest<any>, reply: FastifyReply) {
    try {
      const params = (req.params || {}) as { reference: string };
      const monnifyService = (req.server as any).monnifyService;
      const result = await adminService.verifyMonnifyPayment(params.reference, monnifyService);
      return reply.send(result);
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
    }
  }

  async refundOrder(req: FastifyRequest<any>, reply: FastifyReply) {
    try {
      const params = (req.params || {}) as { reference: string };
      const body = (req.body || {}) as { reason?: string };
      const monnifyService = (req.server as any).monnifyService;
      const result = await adminService.initiateMonnifyRefund(params.reference, body.reason || 'Customer refund', monnifyService);
      return reply.send(result);
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
    }
  }

  async searchMonnifyTransactions(req: FastifyRequest<any>, reply: FastifyReply) {
    try {
      const monnifyService = (req.server as any).monnifyService;
      const query = (req.query || {}) as any;
      const result = await adminService.getMonnifyTransactions(query, monnifyService);
      return reply.send({ success: true, result });
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
    }
  }

  async getCustomers(req: FastifyRequest<any>, reply: FastifyReply) {
    try {
      const query = (req.query || {}) as { page?: string; limit?: string; search?: string };
      const result = await adminService.getCustomers({
        page: query.page ? Number(query.page) : undefined,
        limit: query.limit ? Number(query.limit) : undefined,
        search: query.search,
      });
      return reply.send({ success: true, ...result });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  }
}

export default new AdminController();
