import axios, { AxiosInstance } from 'axios';
import { env } from '@/config';
// import logger from '@/utils/logger';

const META_API_URL = 'https://graph.facebook.com/v18.0';

export class WhatsAppService {
  private axiosInstance: AxiosInstance;

  constructor(axiosInstance?: AxiosInstance) {
    this.axiosInstance =
      axiosInstance ||
      axios.create({
        baseURL: META_API_URL,
        headers: {
          Authorization: `Bearer ${env.META_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });
  }

  /**
   * Sends a WhatsApp message via Meta API.
   * @param to - Recipient's phone number.
   * @param message - Message content.
   * @returns Promise with API response.
   */
  async sendMessage(
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown> | undefined> {
    try {
      const response = await this.axiosInstance.post(
        `/${env.WHATSAPP_PHONE_ID}/messages`,
        data,
      );
      return response.data;
    } catch (error: unknown) {
      console.log(error, 'yoo');
      this.handleError(error);
    }
  }

  /**
   * Handles API errors and logs details.
   * @param error - The caught error.
   */
  private handleError(error: unknown): void {
    if (axios.isAxiosError(error)) {
      console.error(
        'WhatsApp API Error:',
        error.response?.data || error.message,
      );
    } else {
      console.error('Unexpected Error:', error);
    }
    throw new Error('Failed to send WhatsApp message');
  }
}
