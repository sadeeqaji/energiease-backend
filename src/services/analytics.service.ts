import { PostHog } from 'posthog-node';
import env from '@/config/env';
import Order from '@/models/order.model';
import { formatToWhatsAppPhone, getPhoneSearchVariants } from '@/utils/phoneNumber';

class AnalyticsService {
  private client: PostHog | null = null;
  private isInitialized = false;

  constructor() {
    this.init();
  }

  private init() {
    // Only initialize PostHog in production to prevent polluting production analytics with local testing
    const isProduction = env.NODE_ENV === 'production';
    const forceEnabled = process.env.ENABLE_POSTHOG === 'true';

    if (!isProduction && !forceEnabled) {
      console.log('ℹ️ [Analytics] Local environment detected (NODE_ENV=development). PostHog is disabled.');
      return;
    }

    if (env.POSTHOG_API_KEY) {
      try {
        this.client = new PostHog(env.POSTHOG_API_KEY, {
          host: env.POSTHOG_HOST || 'https://eu.i.posthog.com',
          flushAt: 1,
          flushInterval: 2000,
        });
        this.isInitialized = true;
        console.log('✅ PostHog Analytics initialized successfully (Production) with host:', env.POSTHOG_HOST);
      } catch (err) {
        console.warn('⚠️ Failed to initialize PostHog client:', err);
      }
    } else {
      console.log('ℹ️ PostHog API Key not set.');
    }
  }

  /**
   * Base event capture method with error boundary
   */
  public capture(distinctId: string, event: string, properties: Record<string, any> = {}) {
    if (!this.client || !this.isInitialized) {
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
  // CUSTOMER RETENTION & LTV (COHORTS & FREQUENCY)
  // ==========================================

  /**
   * Evaluates customer purchase history to determine retention, order count, and churn intervals
   */
  public async getCustomerRetentionMetrics(phone: string): Promise<{
    is_returning_customer: boolean;
    customer_total_orders: number;
    days_since_last_order: number | null;
    customer_cohort: 'first_time_buyer' | 'repeat_buyer' | 'power_user';
  }> {
    try {
      const cleanPhone = formatToWhatsAppPhone(phone);
      const variants = getPhoneSearchVariants(cleanPhone);

      const pastOrders = await Order.find({
        customerPhone: { $in: variants },
        status: 'success',
      })
        .sort({ createdAt: -1 })
        .select('createdAt amount')
        .lean();

      const count = pastOrders.length;
      const isReturning = count > 0;

      let daysSinceLast: number | null = null;
      if (count > 0 && pastOrders[0].createdAt) {
        const diffMs = Date.now() - new Date(pastOrders[0].createdAt).getTime();
        daysSinceLast = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      }

      let cohort: 'first_time_buyer' | 'repeat_buyer' | 'power_user' = 'first_time_buyer';
      if (count >= 4) cohort = 'power_user';
      else if (count >= 1) cohort = 'repeat_buyer';

      return {
        is_returning_customer: isReturning,
        customer_total_orders: count + 1, // current purchase included
        days_since_last_order: daysSinceLast,
        customer_cohort: cohort,
      };
    } catch (e) {
      return {
        is_returning_customer: false,
        customer_total_orders: 1,
        days_since_last_order: null,
        customer_cohort: 'first_time_buyer',
      };
    }
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
    gatewayFee?: number,
    retention?: {
      is_returning_customer?: boolean;
      customer_total_orders?: number;
      days_since_last_order?: number | null;
      customer_cohort?: string;
    }
  ) {
    this.capture(phone, 'payment_completed', {
      order_reference: orderRef,
      amount,
      gateway,
      gateway_fee: gatewayFee,
      ...retention,
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
      is_returning_customer?: boolean;
      customer_total_orders?: number;
      days_since_last_order?: number | null;
      customer_cohort?: string;
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
      is_returning_customer: details?.is_returning_customer,
      customer_total_orders: details?.customer_total_orders,
      days_since_last_order: details?.days_since_last_order,
      customer_cohort: details?.customer_cohort,
    });
  }

  /**
   * CRITICAL ALERT: Token was generated, but Meta WhatsApp message failed delivery
   */
  public trackWhatsAppDeliveryFailed(
    phone: string,
    orderRef: string,
    token: string,
    errorCode: string | number,
    errorMessage: string,
    metadata?: {
      disco?: string;
      amount?: number;
      units?: number;
    }
  ) {
    this.capture(phone, 'whatsapp_delivery_failed', {
      order_reference: orderRef,
      token_masked: token.length > 4 ? `****${token.slice(-4)}` : token,
      meta_error_code: String(errorCode),
      meta_error_message: errorMessage,
      disco: metadata?.disco?.toUpperCase(),
      amount: metadata?.amount,
      units: metadata?.units,
      requires_immediate_agent_call: true,
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
