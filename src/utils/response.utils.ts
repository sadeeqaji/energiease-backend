import { FastifyReply } from 'fastify';

interface SuccessResponse {
    statusCode: number;
    message: string;
    data?: unknown;
}

export function sendSuccessResponse(
    reply: FastifyReply,
    statusCode: number,
    message: string,
    data?: unknown,
): void {
    const response: SuccessResponse = {
        statusCode,
        message,
        data,
    };
    reply.status(statusCode).send(response);
}