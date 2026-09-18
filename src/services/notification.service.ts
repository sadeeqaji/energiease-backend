import telegramService from './telegram.service';

export type NotificationAlert = {
    title: string;
    fields: { title: string; value: string; short?: boolean }[];
    stack?: string;
    severity?: 'critical' | 'warning' | 'info';
};

export class NotificationService {
    private escapeHtml(text: string): string {
        return (text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    async sendAlert(params: NotificationAlert): Promise<boolean> {
        try {
            const severityIcon = {
                critical: '🚨',
                warning: '⚠️',
                info: 'ℹ️',
            }[params.severity || 'critical'];

            let message = `${severityIcon} <b>${this.escapeHtml(params.title)}</b>\n\n`;

            for (const field of params.fields) {
                message += `<b>${this.escapeHtml(field.title)}:</b> ${field.value}\n`;
            }

            if (params.stack) {
                const cleanStack = this.escapeHtml(params.stack.substring(0, 800));
                message += `\n<pre>${cleanStack}</pre>\n`;
            }

            message += `\n<i>Env: ${process.env.NODE_ENV || 'production'} | ${new Date().toLocaleTimeString('en-GB')}</i>`;

            return await telegramService.sendAlert(message);
        } catch (error: any) {
            console.error('[NotificationService] Failed to dispatch Telegram alert:', error?.message);
            return false;
        }
    }

    // Alias for backward compatibility
    async slack(params: NotificationAlert): Promise<boolean> {
        return this.sendAlert(params);
    }

    async vendFailure(params: {
        reference: string;
        amount: number;
        error: Error;
        provider?: string;
        metadata?: Record<string, string>;
    }) {
        const disco = params.metadata?.disco || '';
        const meter = params.metadata?.meterNumber || '';

        await this.sendAlert({
            title: `Vending Failed (${params.provider || 'Unknown'})`,
            fields: [
                { title: 'Reference', value: `<code>${params.reference}</code>` },
                { title: 'Amount', value: `₦${params.amount.toLocaleString()}` },
                { title: 'Provider', value: params.provider || 'Unknown' },
                ...(disco ? [{ title: 'DISCO', value: disco }] : []),
                ...(meter ? [{ title: 'Meter', value: `<code>${meter}</code>` }] : []),
                ...Object.entries(params.metadata || {})
                    .filter(([k]) => !['disco', 'meterNumber'].includes(k))
                    .map(([k, v]) => ({
                        title: k,
                        value: v,
                    })),
                { title: 'Error', value: `<code>${this.escapeHtml(params.error.message)}</code>` },
            ],
            stack: params.error.stack,
            severity: 'critical',
        });
    }
}