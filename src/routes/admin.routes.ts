import { FastifyInstance } from 'fastify';
import adminController from '@/controllers/admin.controller';
import { requirePermission } from '@/middleware/rbac.middleware';

export default async function adminRoutes(fastify: FastifyInstance) {
  // All admin routes require a valid access token
  fastify.addHook('onRequest', fastify.authenticateAccessToken);

  // Profile of current authenticated staff user
  fastify.get('/me', adminController.getMe.bind(adminController));

  // Executive Dashboard KPIs & Analytics
  fastify.get('/stats', adminController.getStats.bind(adminController));
  fastify.get('/trends', adminController.getOrderTrends.bind(adminController));
  fastify.get('/disco-health', adminController.getDiscoHealth.bind(adminController));

  // Customer Support Desk & Orders Management
  fastify.get(
    '/orders',
    { preHandler: [requirePermission('view_orders')] },
    adminController.listOrders.bind(adminController)
  );

  fastify.get(
    '/orders/:reference',
    { preHandler: [requirePermission('view_orders')] },
    adminController.getOrderDetail.bind(adminController)
  );

  fastify.post(
    '/orders/:reference/retry',
    { preHandler: [requirePermission('manage_orders')] },
    adminController.retryVend.bind(adminController)
  );

  fastify.post(
    '/orders/:reference/resend-whatsapp',
    { preHandler: [requirePermission('send_tokens')] },
    adminController.resendToken.bind(adminController)
  );

  // Live Provider Telemetry: BuyPower Re-query & Monnify Payment Verification
  fastify.get(
    '/orders/:reference/buypower-requery',
    { preHandler: [requirePermission('manage_orders')] },
    adminController.requeryBuyPower.bind(adminController)
  );

  fastify.get(
    '/orders/:reference/monnify-verify',
    { preHandler: [requirePermission('view_orders')] },
    adminController.verifyMonnifyPayment.bind(adminController)
  );

  // Automated Refund through Monnify Gateway (Superadmin / Accounting / Orders Management)
  fastify.post(
    '/orders/:reference/refund',
    { preHandler: [requirePermission('manage_orders')] },
    adminController.refundOrder.bind(adminController)
  );

  // Accounting & Financial Reconciliation
  fastify.get(
    '/accounting/summary',
    { preHandler: [requirePermission('view_accounting')] },
    adminController.getAccountingSummary.bind(adminController)
  );

  fastify.get(
    '/accounting/export',
    { preHandler: [requirePermission('view_accounting')] },
    adminController.exportAccounting.bind(adminController)
  );

  fastify.get(
    '/accounting/monnify-transactions',
    { preHandler: [requirePermission('view_accounting')] },
    adminController.searchMonnifyTransactions.bind(adminController)
  );

  // Customer & Saved Meters Registry
  fastify.get(
    '/customers',
    { preHandler: [requirePermission('view_customers')] },
    adminController.getCustomers.bind(adminController)
  );
}
