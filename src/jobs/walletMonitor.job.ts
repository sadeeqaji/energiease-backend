import buyPowerService from '@/services/buypower.service';
import telegramService from '@/services/telegram.service';
import OrderModel from '@/models/order.model';
import { FastifyInstance } from 'fastify';

export class WalletMonitor {
    private timer: NodeJS.Timeout | null = null;
    private lastAlertLevel: 'OK' | 'WARNING' | 'CRITICAL' = 'OK';
    private lastAlertTime: number = 0;
    private isRunning: boolean = false;

    // Thresholds (in NGN)
    private readonly WARNING_THRESHOLD = 100000;
    private readonly CRITICAL_THRESHOLD = 50000;
    private readonly CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

    constructor(private readonly fastify: FastifyInstance) {}

    start() {
        if (this.timer) return;

        // Run initial check after 5 seconds
        setTimeout(() => {
            this.checkBalance().catch(err => {
                this.fastify.log.error(err, 'Initial wallet balance check failed');
            });
        }, 5000);

        // Schedule recurring 15-minute check
        this.timer = setInterval(() => {
            this.checkBalance().catch(err => {
                this.fastify.log.error(err, 'Scheduled wallet balance check failed');
            });
        }, this.CHECK_INTERVAL_MS);

        this.fastify.log.info('🕒 BuyPower Wallet Monitor scheduled (runs every 15 minutes)');
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    async checkBalance(): Promise<{ balance: number; commission: number } | null> {
        if (this.isRunning) return null;
        this.isRunning = true;

        try {
            const data = await buyPowerService.getWalletBalance();
            const balance = Number(data.balance) || 0;
            const commission = Number(data.commission) || 0;
            const now = Date.now();

            this.fastify.log.info({ balance, commission }, 'BuyPower wallet balance checked');

            if (balance < this.CRITICAL_THRESHOLD) {
                // Critical Alert: Send if newly critical or if at least 1 hour since last critical alert
                if (this.lastAlertLevel !== 'CRITICAL' || now - this.lastAlertTime > 60 * 60 * 1000) {
                    this.lastAlertLevel = 'CRITICAL';
                    this.lastAlertTime = now;

                    const msg =
                        `🚨 <b>CRITICAL: BuyPower Wallet Balance Depleted!</b>\n\n` +
                        `💰 <b>Current Balance:</b> ₦${balance.toLocaleString()}\n` +
                        `⚡ <b>Commission:</b> ₦${commission.toLocaleString()}\n\n` +
                        `⚠️ <b>IMPACT:</b> Vending is failing for customers right now!\n` +
                        `👉 <b>ACTION:</b> Finance/Ops must fund the BuyPower wallet IMMEDIATELY.\n` +
                        `⏰ <i>${new Date().toISOString()}</i>`;

                    await telegramService.sendAlert(msg);
                }
            } else if (balance < this.WARNING_THRESHOLD) {
                // Warning Alert: Send if newly in warning or if at least 2 hours since last warning
                if (this.lastAlertLevel !== 'WARNING' || now - this.lastAlertTime > 2 * 60 * 60 * 1000) {
                    this.lastAlertLevel = 'WARNING';
                    this.lastAlertTime = now;

                    const msg =
                        `⚠️ <b>WARNING: BuyPower Wallet Low</b>\n\n` +
                        `💰 <b>Current Balance:</b> ₦${balance.toLocaleString()}\n` +
                        `⚡ <b>Commission:</b> ₦${commission.toLocaleString()}\n\n` +
                        `💡 <b>Recommendation:</b> Wallet balance dropped below ₦100,000. Please plan to top up soon to prevent vending disruptions.\n` +
                        `⏰ <i>${new Date().toISOString()}</i>`;

                    await telegramService.sendAlert(msg);
                }
            } else {
                // Balance is healthy
                if (this.lastAlertLevel === 'CRITICAL' || this.lastAlertLevel === 'WARNING') {
                    const recoveryMsg =
                        `✅ <b>BuyPower Wallet Restored!</b>\n\n` +
                        `💰 <b>New Balance:</b> ₦${balance.toLocaleString()}\n` +
                        `⚡ <b>Commission:</b> ₦${commission.toLocaleString()}\n\n` +
                        `Vending operations running normally.`;

                    await telegramService.sendAlert(recoveryMsg);

                    // Check if there are any pending orders waiting for fulfillment and auto-vend them
                    try {
                        const pendingOrders = await this.fastify.orderService.getPendingFulfillmentOrders();
                        if (pendingOrders.length > 0) {
                            this.fastify.log.info(`Found ${pendingOrders.length} pending order(s). Auto-vending after wallet refill...`);
                            for (const order of pendingOrders) {
                                await this.fastify.orderService.retryVendOrder(order.reference);
                            }
                        }
                    } catch (retryErr) {
                        this.fastify.log.error(retryErr, 'Auto-retry after wallet restore failed');
                    }
                }
                this.lastAlertLevel = 'OK';

                // Check for any queued orders waiting for provider recovery
                await this.checkAndVendQueuedOrders(balance);
            }

            return data;
        } catch (error: any) {
            this.fastify.log.error(error, 'Failed to check BuyPower balance');
            return null;
        } finally {
            this.isRunning = false;
        }
    }

    async checkAndVendQueuedOrders(balance: number) {
        if (balance < this.CRITICAL_THRESHOLD) return;

        try {
            const queuedOrders = await OrderModel.find({
                status: 'processing',
                fulfillmentFailureReason: /PROVIDER_OFFLINE/i
            }).limit(20);

            if (queuedOrders.length === 0) return;

            this.fastify.log.info(`Checking ${queuedOrders.length} queued order(s) for provider recovery...`);

            for (const order of queuedOrders) {
                const electricity = order.details as any;
                const disco = electricity?.disco;
                if (!disco) continue;

                const reliability = await buyPowerService.getDiscoReliability(disco);
                if (reliability.isOnline && reliability.isReliable) {
                    this.fastify.log.info({ ref: order.reference, disco }, 'DISCO back online! Auto-vending queued order...');
                    const res = await this.fastify.orderService.retryVendOrder(order.reference);
                    if (res.success) {
                        await telegramService.sendAlert(
                            `⚡ <b>Queued Order Auto-Vended!</b>\n\n` +
                            `📋 <b>Ref:</b> <code>${order.reference}</code>\n` +
                            `🏢 <b>Provider:</b> ${disco} is back online\n` +
                            `💰 <b>Amount:</b> ₦${order.amount.toLocaleString()}\n` +
                            `📱 <b>Customer:</b> ${order.customerPhone}\n\n` +
                            `<i>Token successfully generated and delivered to customer on WhatsApp.</i>`
                        );
                    }
                }
            }
        } catch (err: any) {
            this.fastify.log.error(err, 'Error checking queued provider orders');
        }
    }
}
