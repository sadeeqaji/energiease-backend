import { PostHog } from 'posthog-node';
import env from '@/config/env';

class AnalyticsService {
  private client: PostHog | null = null;
  private isInitialized = false;

  constructor() {
    this.init();
  }

  private init() {
    if (env.POSTHOG_API_KEY) {
      try {
        this.client = new PostHog(env.POSTHOG_API_KEY, {
          host: env.POSTHOG_HOST || 'https://eu.i.posthog.com',
          flushAt: 1, // Flush events quickly for low latency in serverless / Node
          flushInterval: 2000,
        });
        this.isInitialized = true;
        console.log('✅ PostHog Analytics initialized successfully with host:', env.POSTHOG_HOST);
      } catch (err) {
        console.warn('⚠️ Failed to initialize PostHog client:', err);
      }
    } else {
      console.log('ℹ️ PostHog API Key not set. Analytics events will be logged in debug mode.');
    }
  }

  /**
   * Base event capture method with error boundary
   */
  public capture(distinctId: string, event: string, properties: Record<string, any> = {}) {
    if (!this.client || !this.isInitialized) {
      if (env.NODE_ENV === 'development') {
        console.debug(`[Analytics Mock] Event: "${event}" | DistinctId: ${distinctId}`, properties);
      }
      return;
    }

    try {
      this.client.capture({
        distinctId: String(distinctId),
        event,
        properties: {
          ...properties,
          environment: env.NODE_ENV,
          service: 'energiease-backend',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.warn(`⚠️ PostHog capture failed for "${event}":`, err);
    }
  }

  /**
   * Measure latency of an async operation and track automatically
   */
  public async trackTiming<T>(
    distinctId: string,
    event: string,
    properties: Record<string, any>,
    fn: () => Promise<T>
  ): Promise<T> {
    const startTime = performance.now();
    let isSuccess = true;
    let errorMsg: string | undefined;

    try {
      return await fn();
    } catch (err: any) {
      isSuccess = false;
      errorMsg = err?.message || 'Operation failed';
      throw err;
    } finally {
      const durationMs = Math.round(performance.now() - startTime);
      this.capture(distinctId, event, {
        ...properties,
        duration_ms: durationMs,
        duration_seconds: +(durationMs / 1000).toFixed(2),
        success: isSuccess,
        ...(errorMsg ? { error_message: errorMsg } : {}),
      });
    }
  }

  // ==========================================
  // WHATSAPP BOT & CONVERSATION EVENTS
  // ==========================================

  public trackWhatsAppMessageReceived(phone: string, textPreview?: string) {
    this.capture(phone, 'whatsapp_message_received', {
      text_preview: textPreview ? textPreview.slice(0, 60) : undefined,
    });
  }

  public trackBotIntent(phone: string, intent: string, extra?: Record<string, any>) {
    this.capture(phone, 'bot_intent_detected', {
      intent,
      ...extra,
    });
  }

  // ==========================================
  // METER VALIDATION & DISCO EVENTS
  // ==========================================

  public trackMeterValidation(
    phone: string,
    disco: string,
    meterNumber: string,
    isValid: boolean,
    durationMs: number,
    extra?: { meterType?: string; error?: string }
  ) {
    this.capture(phone, 'meter_validation', {
      disco: disco.toUpperCase(),
      meter_number_masked: meterNumber.slice(-4),
      is_valid: isValid,
      duration_ms: durationMs,
      ...extra,
    });
  }

  // ==========================================
  // PAYMENT & ORDER EVENTS
  // ==========================================

  public trackPaymentInitiated(
    phone: string,
    orderRef: string,
    amount: number,
    disco: string,
    gateway: 'monnify' | 'paystack' = 'monnify'
  ) {
    this.capture(phone, 'payment_link_generated', {
      order_reference: orderRef,
      amount,
      disco: disco.toUpperCase(),
      gateway,
    });
  }

  public trackPaymentReceived(
    phone: string,
    orderRef: string,
    amount: number,
    gateway: string,
    gatewayFee?: number
  ) {
    this.capture(phone, 'payment_completed', {
      order_reference: orderRef,
      amount,
      gateway,
      gateway_fee: gatewayFee,
    });
  }

  // ==========================================
  // TOKEN VENDING & LATENCY (CRITICAL FINTECH METRIC)
  // ==========================================

  public trackTokenVend(
    phone: string,
    orderRef: string,
    disco: string,
    status: 'success' | 'failed' | 'requires_intervention',
    durationMs: number,
    details?: {
      amount?: number;
      units?: number;
      tokenLength?: number;
      failureReason?: string;
      provider?: string;
    }
  ) {
    this.capture(phone, 'token_vended', {
      order_reference: orderRef,
      disco: disco.toUpperCase(),
      status,
      duration_ms: durationMs,
      duration_seconds: +(durationMs / 1000).toFixed(2),
      provider: details?.provider || 'BuyPower',
      amount: details?.amount,
      units: details?.units,
      token_generated: status === 'success',
      failure_reason: details?.failureReason,
    });
  }

  // ==========================================
  // SUPPORT WORKSPACE EVENTS
  // ==========================================

  public trackSupportTicketOpened(phone: string, ticketId: string, reason: string) {
    this.capture(phone, 'support_ticket_opened', {
      ticket_id: ticketId,
      trigger_reason: reason,
    });
  }

  public trackSupportReplySent(ticketId: string, sender: 'agent' | 'customer', phone?: string) {
    this.capture(phone || ticketId, 'support_reply_sent', {
      ticket_id: ticketId,
      sender,
    });
  }

  public trackSupportTicketResolved(
    phone: string,
    ticketId: string,
    resolutionReason: string,
    totalDurationMinutes?: number
  ) {
    this.capture(phone, 'support_ticket_resolved', {
      ticket_id: ticketId,
      resolution_reason: resolutionReason,
      duration_minutes: totalDurationMinutes,
    });
  }

  /**
   * Graceful flush and shutdown
   */
  public async shutdown() {
    if (this.client) {
      await this.client.shutdown();
    }
  }
}

export const analytics = new AnalyticsService();
