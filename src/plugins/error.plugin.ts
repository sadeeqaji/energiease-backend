import { AppException } from '@/utils/appException.utils';
import logger from '@/utils/logger';
import { FastifyInstance, FastifyError } from 'fastify';

export const errorHandler: FastifyInstance['errorHandler'] = (
  error: FastifyError,
  request,
  reply,
) => {
  if (error.validation) {
    const validationErrors = error.validation.map((err) => {
      let field = 'unknown';
      if (err.instancePath) {
        field = err.instancePath.replace(/^\//, '');
      } else if (err.params?.missingProperty) {
        field = err.params.missingProperty as string;
      }
      return {
        field,
        message: err.message?.replace(/\\*"/g, '') || 'Validation error',
      };
    });
    reply.status(400).send({
      type: 'ValidationError',
      message: error.message,
      errors: validationErrors,
    });
    return;
  }

  if (error instanceof AppException) {
    reply.status(error.statusCode).send({
      type: error.type,
      message: error.message,
      details: error.details,
    });
    return;
  }

  logger.error(error, 'Unhandled error occurred.');
  reply.status(500).send({
    type: 'ServerError',
    message: 'An unexpected error occurred.',
  });
};
