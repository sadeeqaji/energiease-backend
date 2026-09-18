import axios from 'axios';
import { env } from '@/config';

export class TelegramService {
    private botToken: string | undefined;
    private chatId: string | undefined;
    private topicId: string | undefined;

    constructor() {
        this.botToken = env.TELEGRAM_BOT_TOKEN;
        this.chatId = env.TELEGRAM_CHAT_ID;
        this.topicId = env.TELEGRAM_TOPIC_ID;
    }

    async sendAlert(htmlMessage: string, customTopicId?: string | number): Promise<boolean> {
        if (!this.botToken || !this.chatId) {
            console.log('[TelegramService] Bot token or Chat ID not configured. Message:', htmlMessage.replace(/<[^>]*>?/gm, ''));
            return false;
        }

        try {
            const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
            const payload: Record<string, any> = {
                chat_id: this.chatId,
                text: htmlMessage,
                parse_mode: 'HTML',
                disable_web_page_preview: true,
            };

            const threadId = customTopicId || this.topicId;
            if (threadId) {
                payload.message_thread_id = Number(threadId);
            }

            await axios.post(url, payload, { timeout: 10000 });
            return true;
        } catch (error: any) {
            console.error('[TelegramService] Error sending Telegram alert:', error.response?.data || error.message);
            return false;
        }
    }
}

export default new TelegramService();
