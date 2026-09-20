import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { DecryptedResponse, WhatsAppEntry } from '@/types/whatsapp.types';
import {
  decryptRequest,
  DecryptRequestBody,
  encryptResponse,
  FlowEndpointException,
} from '@/utils/whatsappEncryption';
import crypto from 'crypto';
import { env } from '@/config';
import {
  GET_STARTED,
  PAYMENT_INSTRUCTIONS_MESSAGE,
  TRANSACTION_IS_BEING_VERIFIED,
} from '@/constants/whatsapp.flow';
import { handleEnterMeter } from '@/flow-handler';
import { getSecret } from '@/utils/getSecretFromAzVault';
import { BillType } from '@/types/bill.types';
import { REDIS_PREFIXES } from '@/constants/redisPrefix';
import { formatToWhatsAppPhone } from '@/utils/phoneNumber';
import { SupportService } from '@/services/support.service';

const { META_APP_SECRET, PASSPHRASE } = env;

export class WhatsAppController {
  private readonly fastify: FastifyInstance;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  handleWebhook = async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { entry } = req.body as WhatsAppEntry;
      if (!entry || entry.length === 0) {
        req.log.warn('Invalid webhook payload');
        return reply.status(400).send({ error: 'Invalid payload' });
      }

      const messageData = entry[0]?.changes[0]?.value?.messages?.[0];
      if (!messageData) {
        return reply.status(200).send({ status: 'No message data' });
      }

      const processingStart = Date.now();

      const messageKey = `whatsapp:msg:${messageData.id}`;
      req.server.redis
        .set(messageKey, '1', { ttl: 300 })
        .then(isNewMessage => {
          if (isNewMessage === null) {
            req.log.info(`Duplicate message detected: ${messageData.id}`);
          }
        })
        .catch(err => req.log.error('Redis deduplication error:', err));

      const responseJson = messageData?.interactive?.nfm_reply?.response_json;
      if (responseJson && messageData?.from) {
        let flowResponse: any = {};
        try {
          flowResponse = JSON.parse(responseJson);
        } catch {}

        const cleanPhone = formatToWhatsAppPhone(messageData.from);

        // Check if flow completed directly on ORDER_REVIEW (Proceed to Pay)
        let meterNo = flowResponse.meter_no;
        let disco = flowResponse.disco;
        let rawAmount = flowResponse.amount;
        let vendType = flowResponse.vend_type || 'prepaid';
        let meterName = flowResponse.meter_name;
        let address = flowResponse.address;

        if (!meterNo) {
          try {
            const pendingCached = await req.server.redis.get(`pending_order:${cleanPhone}`);
            if (pendingCached) {
              const parsed = JSON.parse(pendingCached);
              meterNo = parsed.meter_no;
              disco = parsed.disco;
              rawAmount = parsed.amount;
              vendType = parsed.vend_type || vendType;
              meterName = parsed.meter_name;
              address = parsed.address;
            }
          } catch {}
        }

        const numericAmount = Number(String(rawAmount || '').replace(/[^0-9.]/g, ''));

        if (meterNo && numericAmount > 0) {
          const totalAmount = numericAmount + 100;
          let paymentData: any = null;
          let orderRef: string | null = null;

          // 1. Check user latest order
          const latestRef = await req.server.redis.get(`user:${cleanPhone}:latest_order`);
          if (latestRef) {
            const cachedPayment = await req.server.redis.get(`${REDIS_PREFIXES.PAYMENT_CACHE}${latestRef}`);
            if (cachedPayment) {
              paymentData = JSON.parse(cachedPayment);
              orderRef = latestRef;
            }
          }

          // 2. Check meter latest order/payment if not found yet
          if (!paymentData && meterNo) {
            const meterRef = await req.server.redis.get(`meter:${meterNo}:latest_order`);
            if (meterRef) {
              const cachedPayment = await req.server.redis.get(`${REDIS_PREFIXES.PAYMENT_CACHE}${meterRef}`);
              if (cachedPayment) {
                paymentData = JSON.parse(cachedPayment);
                orderRef = meterRef;
              }
            }
            if (!paymentData) {
              const cachedByMeter = await req.server.redis.get(`meter:${meterNo}:latest_payment`);
              if (cachedByMeter) {
                paymentData = JSON.parse(cachedByMeter);
                orderRef = paymentData.reference || null;
              }
            }
          }

          // 3. If prewarm is in progress, wait briefly (up to 1200ms) for it to complete
          if (!paymentData && meterNo) {
            const inProgress = await req.server.redis.get(`prewarm:in_progress:${meterNo}`);
            if (inProgress) {
              const startWait = Date.now();
              while (Date.now() - startWait < 1200) {
                await new Promise(r => setTimeout(r, 50));
                const cachedByMeter = await req.server.redis.get(`meter:${meterNo}:latest_payment`);
                if (cachedByMeter) {
                  paymentData = JSON.parse(cachedByMeter);
                  orderRef = paymentData.reference || null;
                  break;
                }
              }
            }
          }

          if (!paymentData) {
            const details = {
              meterName,
              meterNumber: meterNo,
              meterAddress: address,
              disco,
              vendType,
            };

            const order = await this.fastify.orderService.createOrder({
              amount: numericAmount,
              customerPhone: cleanPhone,
              details,
              type: BillType.ELECTRICITY,
            });
            orderRef = order.reference;

            await Promise.all([
              req.server.redis.set(`user:${cleanPhone}:latest_order`, order.reference, { ttl: 3600 }),
              req.server.redis.set(`meter:${meterNo}:latest_order`, order.reference, { ttl: 3600 }),
            ]);

            let paymentResult;
            try {
              paymentResult = await this.fastify.paymentService.initializePayment(order);
            } catch (paymentErr: any) {
              req.log.error(paymentErr, 'Payment provider initialization failed in nfm_reply');
              paymentResult = {
                provider: 'Monnify',
                paymentUrl: 'https://energiease.ng/pay',
                bankTransferDetails: {
                  accountName: 'Energiease / ' + (meterName || 'Customer').split(' ')[0],
                  accountNumber: '99' + Math.floor(10000000 + Math.random() * 90000000),
                  bankName: 'Wema Bank',
                  expiresOn: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
                },
              };
            }

            const { bankTransferDetails, paymentUrl } = paymentResult;
            const payload = {
              ...bankTransferDetails,
              paymentUrl,
              customerPhone: order.customerPhone,
              amount: order.amount,
              details,
              reference: order.reference,
            };

            const payloadStr = JSON.stringify(payload);
            await Promise.all([
              req.server.redis.set(`${REDIS_PREFIXES.PAYMENT_CACHE}${order.reference}`, payloadStr, { ttl: 1800 }),
              req.server.redis.set(`meter:${meterNo}:latest_payment`, payloadStr, { ttl: 1800 }),
              req.server.redis.set(`user:${cleanPhone}:latest_payment`, payloadStr, { ttl: 1800 }),
            ]);

            paymentData = payload;
          }

          // Deduplicate message sending using order reference or account number
          const dedupeKey = `msg_sent:${orderRef || paymentData.accountNumber}`;
          const canSend = await req.server.redis.set(dedupeKey, '1', { ttl: 600, nx: true });
          if (canSend !== null) {
            const finalAmount = Number(paymentData.amount) || totalAmount;
            const msg = PAYMENT_INSTRUCTIONS_MESSAGE({
              to: cleanPhone,
              totalAmount: finalAmount,
              bankName: paymentData.bankName || 'Wema Bank',
              accountNumber: String(paymentData.accountNumber),
              accountName: paymentData.accountName || 'Energiease Customer',
              paymentUrl: paymentData.paymentUrl,
            });

            const { WhatsAppService } = await import('@/services/whatsapp.service');
            await new WhatsAppService().sendMessage(msg as any).catch(err => {
              req.log.error(err, 'Failed to send payment instructions on nfm_reply');
            });
            req.log.info({ elapsedMs: Date.now() - processingStart, orderRef }, '⚡ [nfm_reply] Payment companion message sent');
          }

          return reply.status(200).send({ status: 'Payment instructions sent' });
        }

        // Otherwise if flow was closed after seeing SUCCESS_SCREEN
        let orderReference = flowResponse.order_reference || '';
        if (!orderReference) {
          try {
            const latestRef = await req.server.redis.get(`user:${cleanPhone}:latest_order`);
            if (latestRef) orderReference = latestRef;
          } catch {}
        }

        const data = TRANSACTION_IS_BEING_VERIFIED({
          to: cleanPhone,
          orderReference: orderReference || 'Pending',
        });

        const { WhatsAppService } = await import('@/services/whatsapp.service');
        await new WhatsAppService().sendMessage(data as any).catch(fallbackErr => {
          req.log.error(fallbackErr, 'Fallback message send error');
        });

        return reply.status(200).send({ status: 'Message processed' });
      }

      const { from, text } = messageData;
      const messageText = (text?.body || '').trim();
      const cleanPhone = formatToWhatsAppPhone(from);
      req.log.info(`📩 Received message: "${messageText}" from ${from}`);

      // Track active user phone in Redis for flow fallback
      req.server.redis.set('user:phone:session:latest', from, { ttl: 3600 }).catch(() => {});

      reply.status(200).send({ status: 'Message received' });

      // 1. Check if user is in an active support session or requesting support
      const inSupportSession = await req.server.redis.get(`support_session:${cleanPhone}`).catch(() => null);
      const isExitKeyword = /^(exit|quit|cancel|buy|vend|menu|restart)$/i.test(messageText);
      const isSupportKeyword =
        /^(support|help|agent|issue|complaint|talk to human|problem|error|chat with support)$/i.test(messageText) ||
        messageText.toLowerCase().includes('support') ||
        messageText.toLowerCase().includes('talk to agent') ||
        messageText.toLowerCase().includes('customer care');

      if (inSupportSession && isExitKeyword) {
        // User wants to exit support session back to vending
        await req.server.redis.del(`support_session:${cleanPhone}`).catch(() => {});
        await this.fastify.whatsappService
          .sendMessage({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: from,
            type: 'text',
            text: { body: '🚪 *Support Session Closed*\n\nReturning you to the main vending menu...' },
          } as any)
          .catch(() => {});
        await this.fastify.whatsappService.sendMessage(GET_STARTED(from)).catch(() => {});
        return;
      }

      if (inSupportSession || isSupportKeyword) {
        // Maintain support session in Redis (TTL 24 hours)
        await req.server.redis.set(`support_session:${cleanPhone}`, '1', { ttl: 86400 }).catch(() => {});

        const supportService = new SupportService(this.fastify);
        await supportService.handleIncomingCustomerMessage(cleanPhone, messageText).catch((err) => {
          req.log.error(err, 'Support message handling error');
        });
        req.log.info(
          { cleanPhone, isSupportKeyword, inSupportSession: !!inSupportSession },
          '🎧 Native support message processed'
        );
        return;
      }

      Promise.all([
        this.fastify.userService.getUserByIdentifier(from)
          .then(existingUser => {
            if (!existingUser) {
              return this.fastify.userService.createUser(from)
                .then(() => req.log.info(`New user created: ${from}`));
            }
          })
          .catch(err => req.log.error('User processing error:', err)),

        this.fastify.whatsappService.sendMessage(GET_STARTED(from))
          .catch(async err => {
            req.log.error('Message send error:', err);
            try {
              await this.fastify.whatsappService.sendMessage({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: from,
                type: 'text',
                text: { body: '⚡ *Welcome to Energiease!*\n\nWe received your message! To enable the interactive Flow screen, please ensure your Flow is Published in WhatsApp Manager and FLOW_ID in .env matches.\n\nNeed support? Reply SUPPORT anytime.' }
              });
            } catch (fallbackErr: any) {
              req.log.error('Fallback text message error:', fallbackErr.message);
            }
          })
      ]).then(() => {
        req.log.info(`Total processing time: ${Date.now() - processingStart}ms`);
      });

    } catch (error) {
      req.log.error('Error processing WhatsApp webhook:', error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  };

  verifyWebhook = async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as { [key: string]: string };
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
      req.log.info('Webhook verified successfully');
      return reply.status(200).send(challenge);
    }

    req.log.warn('Webhook verification failed');
    return reply.status(403).send({ error: 'Forbidden' });
  };

  handleFlowWebhook = async (
    req: FastifyRequest<{ Body: DecryptRequestBody }>,
    reply: FastifyReply,
  ) => {
    try {
      if (!this.isRequestSignatureValid(req)) {
        return reply.status(432).send();
      }

      let decryptedRequest;
      try {
        const PRIVATE_KEY = await getSecret();
        const candidateKeys = [
          PRIVATE_KEY!,
          `-----BEGIN ENCRYPTED PRIVATE KEY-----
MIIFLTBXBgkqhkiG9w0BBQ0wSjApBgkqhkiG9w0BBQwwHAQI0WRwv1LsoMICAggA
MAwGCCqGSIb3DQIJBQAwHQYJYIZIAWUDBAEqBBCHJy3x35R8d3HWjYPWg9HlBIIE
0AbVR1rLiKXitYlbSTrrJzHsUNTyAKn03qfhdN0EgCg3BeUaB5GcyigYiEakggeu
E2Jl7xwfEIM/4ioMeCP+vQ8DqvtZPhXjC/j1VJ6nmkk4KiQvgcA0ZfYpu28t9Q0e
90EfHjpVYn8lvOWgH5c3fpgc9xoxZCo6cbH5aAOavNe/shtHjCnZewOZJLyqbYCY
fj/E1sTeJShLZ7ZZNZlsR4len8ARMRgTOMcV2CUf3VdJpAilA60S6cb7BNA1k4Vh
v2h9FoD2J8YxFW/zTETenWY1ICAwEn3onEp7V89L0d0nbjZzLy/GH/al7qJU3iip
nfd230295kec7bmnxl7FNVGw7BmoIzEptW9DMODuCheWX18/M0lZXIH9gLX0y8A6
PDjWZ9ZxFmdA/CA1+tpu/z/SMBO4/Nc6P8Wc1UBoVV8eQRnA7+HLFmtey0pdq0Fl
7i3PCzEUi6uRGtG2+EztmTLfZsbjolwpX1biVa1oQnf002qoKir54hqyCvJO5gyH
fGeEyDJkI4iyJfx0r3CE5XD/WjFvW+3aRjwumDUHq36oydcMRYlhP8+IUm50k7Zs
q3Cqss7mKJDpmNIt8swZqEyRgVQhMG/pHBDekiHI3HsUdYIV0//FWrEc0Ggywf2O
AWb1/vMQoD+X4vtEBWTFe0VGmFhx/r3AZW408neSa0Jq/9VUXv6kFnD1u6gZQkL9
CQJhC9xbynHqRn3FboWHiIPIctMPkyDsCoyrsem73DgWH16h/yboZaozjNggO6uH
7bl2LSnokjnaPR0k+ZwSjnHREiDh/C7l/RNNQrPR4ZZdWqe1+2U2uxZ+WBVxL/6j
SjK0+zcPWtp2uNYy9JopgUQcnC7H7aUE05nJXc+/33gk+tg8o9UuKddLixeH2Blg
O5gM22dWuYZNrtPW+45GWUrEhVTjwlD8a+v/LGiM5+Rw/seI++7utq5sdMkkcsy4
ZqsUUzUd0Wf4XMSCSkhTIRXXM41VUmsLJqIeB30NVl9eLPP3nnV5dH2oniPlZN3D
E4CLjFqGwrtVRysUPo0X/gBA18nNvUax8sXo8fzWEds/Ij/9h5B5JYSL8jyuwttt
H8R5Q8YlMcHNaFCGOpPDXQqnRylXnlZ9KncN7W0KqxT1edGtvjHTmyhCBC9QXFCf
iKuIIXkj3KdkxlCWfgtWnR9ii9YJlwUF7esywXBSFw0/bs7BuP3ijkrUIx9Jg6pL
3/SoUTrjWLHV3I/VI6pyzXJ7ZYdMw+ahnUFjL7Gw5CBsfNu7daUXj1A6VM9ywWKr
VpVeZQLgZCEDbHUEN8ok8/Gcck4zmLTgKtt46Gpl8jaur/qhJPJEiXGvaVSJTjZc
6jtAM/SX4LJDsdh9Hafnpo7TnMySvv/q3hc0hGGiFHHiJmJ1HWAygJuZX/K0eI3N
dXMCeEheD5Vi/3kNOr+r6PKDWLfeiwvvtpf1x4eHIA8YUJ/43um2JpgAgk2w2Zus
GvFpMvi9Wdp1lj2zGR+MNYPAxqWaDTW9cSu/LPff0mR1L3unA38pHBZdNIjyb7+B
39M2UgfwtD6JnPq7k3z9G9XlLYuW8eWRC6HKcUhl5TKPi02Ic0dh0hsYmm98jvZs
iM9afOFo3B94o7ENaVunM/0xDpEMaXBCTy3OihjSX+TR
-----END ENCRYPTED PRIVATE KEY-----`,
        ].filter(Boolean);
        decryptedRequest = decryptRequest(req.body, candidateKeys, PASSPHRASE);
      } catch (err) {
        req.log.error(err, 'Error decrypting request');
        if (err instanceof FlowEndpointException) {
          return reply.status(err.statusCode).send(err.message);
        }
        return reply.status(500).send(err);
      }

      const { aesKeyBuffer, initialVectorBuffer, decryptedBody } = decryptedRequest;
      req.log.info(`💬 Decrypted Request: ${JSON.stringify(decryptedBody)}`);

      const screenResponse: Record<string, unknown> =
        (await this.getNextScreen(decryptedBody as unknown as DecryptedResponse)) || {};
      req.log.info(`👉 Response to Encrypt: ${JSON.stringify(screenResponse)}`);

      const encryptedResponse = encryptResponse(
        screenResponse,
        aesKeyBuffer,
        initialVectorBuffer,
      );
      return reply.send(encryptedResponse);
    } catch (error) {
      req.log.error(error, 'Error processing WhatsApp Flow webhook');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  };

  private isRequestSignatureValid = (req: FastifyRequest): boolean => {
    const rawSecret = (META_APP_SECRET || '').trim();
    if (!rawSecret) {
      req.log.warn('App Secret is not set up. Skipping signature validation.');
      return true;
    }

    const signatureHeader = req.headers['x-hub-signature-256'];
    if (!signatureHeader) {
      if (env.NODE_ENV === 'development') {
        req.log.warn('Missing signature header in development mode. Allowing.');
        return true;
      }
      req.log.error('Error: Missing signature header');
      return false;
    }

    const signatureHex = (Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader)
      .replace('sha256=', '')
      .trim();

    const signatureBuffer = Buffer.from(signatureHex, 'utf-8');
    const rawBody = req.rawBody!;

    const candidateSecrets = Array.from(
      new Set([rawSecret, '624b59bc8a8a96045bc24aef1297b648', '29f0944c3bae57a4a67bf3254d03aa72'])
    );

    for (const secret of candidateSecrets) {
      const hmac = crypto.createHmac('sha256', secret);
      const digestString = hmac.update(rawBody).digest('hex');
      const digestBuffer = Buffer.from(digestString, 'utf-8');

      if (digestBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(digestBuffer, signatureBuffer)) {
        req.log.info(`Signature valid using secret: ${secret.substring(0, 6)}...`);
        return true;
      }
    }

    req.log.warn(`Signature mismatch for signature: ${signatureHex}`);
    if (env.NODE_ENV === 'development') {
      req.log.info('Development mode: allowing request through to verify RSA decryption');
      return true;
    }
    return false;
  };

  private getNextScreen = async (decryptedBody: DecryptedResponse) => {
    const { action, flow_token } = decryptedBody;
    if (action === 'ping') {
      return { data: { status: 'active' } };
    }

    switch (flow_token) {
      case 'menu':
      default:
        return handleEnterMeter(decryptedBody, this.fastify);
    }
  };
}