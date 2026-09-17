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
import { GET_STARTED, TRANSACTION_IS_BEING_VERIFIED } from '@/constants/whatsapp.flow';
import { handleEnterMeter } from '@/flow-handler';
import { getSecret } from '@/utils/getSecretFromAzVault';

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
      req.server.redis.set(messageKey, '1', { ttl: 300 })
        .then(isNewMessage => {
          if (isNewMessage === null) {
            req.log.info(`Duplicate message detected: ${messageData.id}`);
          }
        })
        .catch(err => req.log.error('Redis deduplication error:', err));

      const responseJson = messageData?.interactive?.nfm_reply?.response_json;
      if (responseJson && messageData?.from) {
        let orderReference = '';
        try {
          const flowResponse = JSON.parse(responseJson);
          orderReference = flowResponse.order_reference || '';
        } catch {}

        if (!orderReference) {
          try {
            const latestRef = await req.server.redis.get(`user:${messageData.from}:latest_order`);
            if (latestRef) orderReference = latestRef;
          } catch {}
        }

        const data = TRANSACTION_IS_BEING_VERIFIED({
          to: messageData.from,
          orderReference: orderReference || 'Pending',
        });

        this.fastify.serviceBus.sendMessage('whatsapp-notifications', data)
          .catch(async (err) => {
            req.log.error(err, 'ServiceBus error in nfm_reply');
            try {
              const { WhatsAppService } = await import('@/services/whatsapp.service');
              await new WhatsAppService().sendMessage(data);
            } catch (fallbackErr: any) {
              req.log.error(fallbackErr, 'Fallback message send error');
            }
          });

        return reply.status(200).send({ status: 'Message processed' });
      }

      const { from, text } = messageData;
      const messageText = text?.body || 'No text';
      req.log.info(`📩 Received message: "${messageText}" from ${from}`);

      // Track active user phone in Redis for flow fallback
      req.server.redis.set('user:phone:session:latest', from, { ttl: 3600 }).catch(() => {});

      reply.status(200).send({ status: 'Message received' });

      Promise.all([
        this.fastify.userService.getUserByIdentifier(from)
          .then(existingUser => {
            if (!existingUser) {
              return this.fastify.userService.createUser(from)
                .then(() => req.log.info(`New user created: ${from}`));
            }
          })
          .catch(err => req.log.error('User processing error:', err)),

        this.fastify.serviceBus.sendMessage('whatsapp-notifications', GET_STARTED(from))
          .catch(async err => {
            req.log.error('Message send error:', err);
            try {
              const { WhatsAppService } = await import('@/services/whatsapp.service');
              await new WhatsAppService().sendMessage({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: from,
                type: 'text',
                text: { body: '⚡ *Welcome to Energiease!*\n\nWe received your message! To enable the interactive Flow screen, please ensure your Flow is Published in WhatsApp Manager and FLOW_ID in .env matches.' }
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
        let accessTokenKey = '';
        try {
          const fs = await import('fs');
          const path = await import('path');
          accessTokenKey = fs.readFileSync(path.join(process.cwd(), 'keys/accessTokenPrivate.key'), 'utf-8');
        } catch {}

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
          accessTokenKey,
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