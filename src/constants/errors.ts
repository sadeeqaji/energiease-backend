export const ExceptionTypes = {
  NotFound: 'NotFound',
  Unauthorized: 'Unauthorized',
  ValidationError: 'ValidationError',
  Conflict: 'Conflict',
  Forbidden: 'Forbidden',
  InternalServerError: 'InternalServerError',
  BadRequest: 'BadRequest',
  FacebookApiError: 'FacebookApiError',
} as const;

export type ExceptionType = keyof typeof ExceptionTypes;
