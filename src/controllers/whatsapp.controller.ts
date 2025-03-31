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
import userService from '@/services/user.service';

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
        const flowResponse = JSON.parse(responseJson);
        const data = TRANSACTION_IS_BEING_VERIFIED({
          to: messageData.from,
          orderReference: flowResponse.order_reference,
        });

        this.fastify.serviceBus.sendMessage('whatsapp-notifications', data)
          .catch(err => req.log.error('ServiceBus error:', err));

        return reply.status(200).send({ status: 'Message processed' });
      }

      const { from, text } = messageData;
      const messageText = text?.body || 'No text';
      req.log.info(`📩 Received message: "${messageText}" from ${from}`);

      reply.status(200).send({ status: 'Message received' });

      Promise.all([
        userService.getUserByIdentifier(from)
          .then(existingUser => {
            if (!existingUser) {
              return userService.createUser(from)
                .then(() => req.log.info(`New user created: ${from}`));
            }
          })
          .catch(err => req.log.error('User processing error:', err)),

        this.fastify.serviceBus.sendMessage('whatsapp-notifications', GET_STARTED(from))
          .catch(err => req.log.error('Message send error:', err))
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
        decryptedRequest = decryptRequest(req.body, PRIVATE_KEY!, PASSPHRASE);
      } catch (err) {
        req.log.error('Error decrypting request:', err);
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
      req.log.error('Error processing WhatsApp Flow webhook:', error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  };

  private isRequestSignatureValid = (req: FastifyRequest): boolean => {
    if (!META_APP_SECRET) {
      req.log.warn('App Secret is not set up. Skipping signature validation.');
      return true;
    }

    const signatureHeader = req.headers['x-hub-signature-256'];
    if (!signatureHeader) {
      req.log.error('Error: Missing signature header');
      return false;
    }

    const signatureBuffer = Buffer.from(
      (Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader)
        .replace('sha256=', ''),
      'utf-8',
    );
    const hmac = crypto.createHmac('sha256', META_APP_SECRET);
    const rawBody = req.rawBody!;
    const digestString = hmac.update(rawBody).digest('hex');
    const digestBuffer = Buffer.from(digestString, 'utf-8');

    req.log.info(`Calculated Digest: ${digestString}`);
    req.log.info(`Received Signature: ${signatureBuffer.toString('utf-8')}`);
    return crypto.timingSafeEqual(digestBuffer, signatureBuffer);
  };

  private getNextScreen = async (decryptedBody: DecryptedResponse) => {
    const { action, flow_token } = decryptedBody;
    if (action === 'ping') {
      return { data: { status: 'active' } };
    }

    switch (flow_token) {
      case 'menu':
        return handleEnterMeter(decryptedBody, this.fastify);
      default:
        return null;
    }
  };
}