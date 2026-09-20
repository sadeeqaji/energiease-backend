import { FastifyInstance } from 'fastify';
import { SupportService } from '@/services/support.service';

export class SupportInactivityMonitor {
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private supportService: SupportService;

  // Run inactivity sweep every 60 seconds
  private readonly CHECK_INTERVAL_MS = 60 * 1000;

  constructor(private readonly fastify: FastifyInstance) {
    this.supportService = new SupportService(fastify);
  }

  start() {
    if (this.timer) return;

    // Run initial sweep after 10 seconds
    setTimeout(() => {
      this.sweep().catch((err) => {
        this.fastify.log.error(err, 'Initial support inactivity sweep failed');
      });
    }, 10000);

    // Recurring 60-second sweep
    this.timer = setInterval(() => {
      this.sweep().catch((err) => {
        this.fastify.log.error(err, 'Scheduled support inactivity sweep failed');
      });
    }, this.CHECK_INTERVAL_MS);

    this.fastify.log.info('🕒 Support Inactivity Monitor scheduled (15-min policy, sweeps every 60s)');
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async sweep(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const { nudgedCount, autoClosedCount } =
        await this.supportService.checkAndHandleInactiveTickets();

      if (nudgedCount > 0 || autoClosedCount > 0) {
        this.fastify.log.info(
          { nudgedCount, autoClosedCount },
          '⚡ Support Inactivity Monitor: processed inactive customer sessions'
        );
      }
    } catch (err: any) {
      this.fastify.log.error(err, 'Error during support inactivity sweep');
    } finally {
      this.isRunning = false;
    }
  }
}
