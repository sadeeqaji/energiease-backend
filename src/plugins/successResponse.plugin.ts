import fp from 'fastify-plugin';
import { FastifyInstance, FastifyReply } from 'fastify';

interface SuccessResponse {
    statusCode: number;
    message: string;
    data?: unknown;
}

declare module 'fastify' {
    interface FastifyReply {
        sendSuccessResponse: (statusCode: number, message: string, data?: unknown) => void;
    }
}

const successResponsePlugin = (fastify: FastifyInstance, options: unknown, done: () => void) => {
    fastify.decorateReply('sendSuccessResponse', function (
        this: FastifyReply,
        statusCode: number,
        message: string,
        data?: unknown,
    ) {
        const response: SuccessResponse = {
            statusCode,
            message,
            data,
        };
        this.status(statusCode).send(response);
    });

    done();
};

export default fp(successResponsePlugin);