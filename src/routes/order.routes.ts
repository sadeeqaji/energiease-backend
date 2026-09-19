import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export default async function orderRoutes(fastify: FastifyInstance) {
    // List all orders requiring fulfillment (due to low provider wallet balance, etc.)
    fastify.get('/pending', async (req: FastifyRequest, reply: FastifyReply) => {
        try {
            const orders = await fastify.orderService.getPendingFulfillmentOrders();
            return reply.send({
                success: true,
                count: orders.length,
                orders: orders.map(o => ({
                    reference: o.reference,
                    amount: o.amount,
                    customerPhone: o.customerPhone,
                    status: o.status,
                    requiresManualIntervention: o.requiresManualIntervention,
                    failureReason: o.fulfillmentFailureReason,
                    createdAt: o.createdAt,
                    details: o.details,
                })),
            });
        } catch (error: any) {
            return reply.status(500).send({ success: false, error: error.message });
        }
    });

    // Query current BuyPower wallet balance
    fastify.get('/wallet-balance', async (req: FastifyRequest, reply: FastifyReply) => {
        try {
            const { default: buyPowerService } = await import('@/services/buypower.service');
            const data = await buyPowerService.getWalletBalance();
            const balance = Number(data.balance) || 0;
            const commission = Number(data.commission) || 0;
            return reply.send({
                success: true,
                provider: 'buypower',
                balance,
                commission,
                status: balance < 50000 ? 'CRITICAL' : balance < 100000 ? 'WARNING' : 'HEALTHY',
            });
        } catch (error: any) {
            return reply.status(500).send({ success: false, error: error.message });
        }
    });

    // Query real-time status of all electricity DISCOs
    fastify.get('/discos/status', async (req: FastifyRequest, reply: FastifyReply) => {
        try {
            const { default: buyPowerService } = await import('@/services/buypower.service');
            const discos = await buyPowerService.getAllDiscosStatus();
            return reply.send({
                success: true,
                updatedAt: new Date().toISOString(),
                count: discos.length,
                discos,
            });
        } catch (error: any) {
            fastify.log.error(error);
            return reply.status(500).send({ success: false, error: error.message });
        }
    });

    // Manually retry vending an order
    fastify.post(
        '/:reference/retry-vend',
        async (req: FastifyRequest<{ Params: { reference: string } }>, reply: FastifyReply) => {
            const { reference } = req.params;
            try {
                const result = await fastify.orderService.retryVendOrder(reference);
                return reply.status(result.success ? 200 : 400).send(result);
            } catch (error: any) {
                return reply.status(500).send({ success: false, error: error.message });
            }
        }
    );

    // Download PDF Transaction Receipt
    fastify.get(
        '/receipt/:reference.pdf',
        async (req: FastifyRequest<{ Params: { reference: string } }>, reply: FastifyReply) => {
            const { reference } = req.params;
            try {
                const order = await fastify.orderService.getOrderByReference(reference);
                if (!order) {
                    return reply.status(404).send({ success: false, message: 'Order not found' });
                }

                const { default: receiptService, getDiscoHotline } = await import('@/services/receipt.service');
                const details = (order.details || {}) as any;
                const token = (order as any).providerResponse?.token || details.token || '';
                const unit = (order as any).providerResponse?.units || details.unit || details.units || '';
                const amount = order.amount || details.amount || 0;
                const disco = details.disco || '';
                const meterNumber = details.meterNumber || '';
                const customerName = details.meterName || details.name || (order as any).user?.name || 'Customer';
                const address = details.meterAddress || details.address || 'N/A';
                const vendType = details.vendType ? (String(details.vendType).toUpperCase().includes('PRE') ? 'Prepaid' : 'Postpaid') : 'Prepaid';
                const transactionId = (order as any).providerOrderId || order.reference || 'N/A';
                const discoHotline = getDiscoHotline(disco);

                const pdfBuffer = await receiptService.generateReceiptPdf({
                    meterNumber,
                    customerName,
                    transactionType: 'Electricity',
                    address,
                    discoHotline,
                    vendType,
                    unit,
                    transactionId,
                    token,
                    amount,
                    date: order.createdAt || new Date(),
                });

                reply
                    .header('Content-Type', 'application/pdf')
                    .header('Content-Disposition', `inline; filename="receipt-${reference}.pdf"`)
                    .send(pdfBuffer);
            } catch (error: any) {
                fastify.log.error(error);
                return reply.status(500).send({ success: false, error: error.message });
            }
        }
    );

    // Also support /:reference/receipt.pdf as alias
    fastify.get(
        '/:reference/receipt.pdf',
        async (req: FastifyRequest<{ Params: { reference: string } }>, reply: FastifyReply) => {
            const { reference } = req.params;
            return reply.redirect(`/orders/receipt/${reference}.pdf`);
        }
    );

    // Payment success landing page to automatically redirect user back to WhatsApp chat from webview
    fastify.get('/payment-success', async (req: FastifyRequest<{ Querystring: { ref?: string } }>, reply: FastifyReply) => {
        const ref = req.query.ref || '';
        const { env } = await import('@/config');
        const botPhone = env.BOT_PHONE_NUMBER || '2349139932585';
        const waLink = `https://wa.me/${botPhone}`;

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Payment Successful • Energiease</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #0b141a;
      color: #e9edef;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px 16px;
      text-align: center;
    }
    .card {
      background: #111b21;
      border: 1px solid #202c33;
      border-radius: 20px;
      padding: 36px 24px;
      width: 100%;
      max-width: 380px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.4);
    }
    .icon-wrap {
      width: 72px;
      height: 72px;
      background: #00a884;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      box-shadow: 0 4px 16px rgba(0, 168, 132, 0.4);
    }
    .icon-wrap svg {
      width: 40px;
      height: 40px;
      fill: none;
      stroke: #ffffff;
      stroke-width: 3.5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 8px;
    }
    p {
      font-size: 15px;
      color: #8696a0;
      line-height: 1.5;
      margin-bottom: 24px;
    }
    .ref-box {
      background: #202c33;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 13px;
      color: #aebac1;
      margin-bottom: 24px;
      font-family: monospace;
      letter-spacing: 0.5px;
    }
    .btn {
      display: block;
      width: 100%;
      background: #00a884;
      color: #111b21;
      text-decoration: none;
      font-size: 16px;
      font-weight: 700;
      padding: 14px 20px;
      border-radius: 28px;
      transition: background 0.2s, transform 0.1s;
    }
    .btn:active {
      background: #02906f;
      transform: scale(0.98);
    }
    .spinner {
      margin-top: 18px;
      font-size: 13px;
      color: #8696a0;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-wrap">
      <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
    </div>
    <h1>Payment Successful!</h1>
    <p>Your payment was verified. Your electricity token has been sent to your WhatsApp chat.</p>
    ${ref ? `<div class="ref-box">Order Ref: ${ref}</div>` : ''}
    <a href="${waLink}" class="btn" id="returnBtn">Return to WhatsApp 💬</a>
    <div class="spinner">Returning automatically...</div>
  </div>

  <script>
    // Automatically navigate back to WhatsApp chat
    const waUrl = "${waLink}";
    setTimeout(() => {
      window.location.href = waUrl;
    }, 1200);
  </script>
</body>
</html>`;

        reply.type('text/html').send(html);
    });
}

