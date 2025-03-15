import axios, { AxiosRequestConfig, AxiosError } from 'axios';
import logger from '@/utils/logger';

class APIError extends Error {
  constructor(
    public message: string,
    public statusCode: number,
    public data?: unknown,
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export const apiRequest = async <T = unknown>(
  options: AxiosRequestConfig,
): Promise<T> => {
  try {
    logger.debug(`Making API request to ${options.url}`, {
      method: options.method,
      data: options.data,
    });

    const response = await axios(options);

    logger.debug(`API request successful: ${options.url}`, {
      status: response.status,
      data: response.data,
    });

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      logger.error(`API request failed: ${options.url}`, {
        status: axiosError.response?.status,
        data: axiosError.response?.data,
        message: axiosError.message,
      });

      throw new APIError(
        (axiosError.response?.data as { message?: string })?.message ||
          'API request failed',
        axiosError.response?.status || 500,
        axiosError.response?.data,
      );
    }

    logger.error(`Unexpected error during API request: ${options.url}`, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw new APIError(
      'An unexpected error occurred.',
      500,
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
};
