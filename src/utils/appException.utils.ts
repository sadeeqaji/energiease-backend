import { ExceptionTypes } from '@/constants/errors';

type ExceptionType = keyof typeof ExceptionTypes;

export class AppException extends Error {
  public statusCode: number;
  public type: ExceptionType;
  public details?: Record<string, unknown>;

  constructor(
    message: string,
    type: ExceptionType,
    statusCode: number = 500,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.type = type;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }

  static NotFound(message: string, details?: Record<string, unknown>) {
    return new AppException(message, 'NotFound', 404, details);
  }

  static Unauthorized(
    message: string = 'Unauthorized access',
    details?: Record<string, unknown>,
  ) {
    return new AppException(message, 'Unauthorized', 401, details);
  }

  static ValidationError(
    message: string = 'Validation error',
    details?: Record<string, unknown>,
  ) {
    return new AppException(message, 'ValidationError', 422, details);
  }

  static Conflict(message: string, details?: Record<string, unknown>) {
    return new AppException(message, 'Conflict', 409, details);
  }

  static Forbidden(
    message: string = 'Access denied',
    details?: Record<string, unknown>,
  ) {
    return new AppException(message, 'Forbidden', 403, details);
  }

  static InternalServerError(
    message: string = 'Internal server error',
    details?: Record<string, unknown>,
  ) {
    return new AppException(message, 'InternalServerError', 500, details);
  }

  static BadRequest(
    message: string = 'Bad request',
    details?: Record<string, unknown>,
  ) {
    return new AppException(message, 'BadRequest', 400, details);
  }

  static FacebookApiError(
    message: string = 'Facebook api error',
    details?: Record<string, unknown>,
  ) {
    return new AppException(message, 'FacebookApiError', 500, details);
  }
}
