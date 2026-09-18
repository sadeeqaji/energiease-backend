import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { env } from '@/config';

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  keepAliveMsecs: 30000,
});

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
        timeout: 10000,
        httpsAgent,
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
      this.handleError(error);
    }
  }

  /**
   * Uploads media (such as PDF receipts) to Meta Graph API.
   * @param fileBuffer - Buffer containing file data.
   * @param filename - Filename (e.g. 'EnergiEase-Receipt.pdf').
   * @param mimeType - MIME type (e.g. 'application/pdf').
   * @returns media ID string.
   */
  async uploadMedia(
    fileBuffer: Buffer,
    filename: string,
    mimeType: string = 'application/pdf',
  ): Promise<string> {
    try {
      const formData = new FormData();
      const blob = new Blob([fileBuffer], { type: mimeType });
      formData.append('file', blob, filename);
      formData.append('type', mimeType);
      formData.append('messaging_product', 'whatsapp');

      const response = await this.axiosInstance.post(
        `/${env.WHATSAPP_PHONE_ID}/media`,
        formData,
        {
          headers: {
            'Content-Type': undefined,
          },
        },
      );

      return response.data?.id;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        console.error(
          'WhatsApp Media Upload Error:',
          error.response?.data || error.message,
        );
      } else {
        console.error('Unexpected Media Upload Error:', error);
      }
      throw error;
    }
  }

  /**
   * Sends a document (such as PDF receipt) via WhatsApp Meta API.
   */
  async sendDocument(params: {
    to: string;
    mediaId?: string;
    documentUrl?: string;
    filename?: string;
    caption?: string;
  }): Promise<Record<string, unknown> | undefined> {
    const documentPayload: Record<string, any> = {
      filename: params.filename || 'Receipt.pdf',
    };

    if (params.mediaId) {
      documentPayload.id = params.mediaId;
    } else if (params.documentUrl) {
      documentPayload.link = params.documentUrl;
    } else {
      throw new Error('Either mediaId or documentUrl must be provided to sendDocument');
    }

    if (params.caption) {
      documentPayload.caption = params.caption;
    }

    return this.sendMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: params.to,
      type: 'document',
      document: documentPayload,
    });
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
