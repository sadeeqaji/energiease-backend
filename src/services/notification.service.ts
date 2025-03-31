import axios from 'axios';
import { FastifyInstance } from 'fastify';
import { AppException } from '@/utils/appException.utils';

type SlackAlert = {
    title: string;
    fields: { title: string; value: string; short?: boolean }[];
    stack?: string;
    severity?: 'critical' | 'warning' | 'info';
};

export class NotificationService {
    // constructor(private readonly fastify: FastifyInstance) { }

    async slack(params: SlackAlert) {
        if (!process.env.SLACK_WEBHOOK_URL) {
            // this.fastify.log.warn('Slack webhook not configured');
            return;
        }

        try {
            const color = {
                critical: '#FF0000',
                warning: '#FFA500',
                info: '#36A64F'
            }[params.severity || 'critical'];

            await axios.post(process.env.SLACK_WEBHOOK_URL, {
                attachments: [{
                    color,
                    title: params.title,
                    fields: params.fields.map(f => ({ ...f, short: f.short ?? true })),
                    text: params.stack ? `\`\`\`${params.stack.substring(0, 1500)}\`\`\`` : '',
                    footer: `Env: ${process.env.NODE_ENV} | ${new Date().toISOString()}`,
                    mrkdwn_in: ['text']
                }]
            });
        } catch (error) {
            // this.fastify.log.error('Slack notification failed:', error);
            throw AppException.InternalServerError('Notification service unavailable');
        }
    }

    async vendFailure(params: {
        reference: string;
        amount: number;
        error: Error;
        provider?: string;
        metadata?: Record<string, string>;
    }) {
        await this.slack({
            title: `⚡ Vending Failed (${params.provider || 'Unknown'})`,
            fields: [
                { title: 'Reference', value: params.reference, short: false },
                { title: 'Amount', value: params.amount.toString(), short: true },
                { title: 'Provider', value: params.provider || 'Unknown', short: true },
                ...Object.entries(params.metadata || {}).map(([k, v]) => ({
                    title: k, value: v, short: true
                })),
                { title: 'Error', value: params.error.message, short: false }
            ],
            stack: params.error.stack,
            severity: 'critical'
        });
    }
}