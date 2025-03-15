import { FastifyRequest, FastifyReply } from 'fastify';
import authService from '@/services/auth.service';

export class AuthController {
  async register(req: FastifyRequest, reply: FastifyReply) {
    const { firstName, lastName, email, password } = req.body as {
      firstName: string;
      lastName: string;
      email: string;
      password: string;
    };

    try {
      const user = await authService.register({
        firstName,
        lastName,
        email,
        password,
      });
      reply.status(201).send(user);
    } catch (error) {
      reply.status(400).send({ error: (error as Error).message });
    }
  }

  async login(req: FastifyRequest, reply: FastifyReply) {
    const { email, password } = req.body as {
      email: string;
      password: string;
    };

    try {
      const { accessToken, refreshToken } = await authService.login(
        email,
        password,
      );
      reply.status(200).send({ accessToken, refreshToken });
    } catch (error) {
      console.log(error, 'error')
      reply.status(400).send({ error: (error as Error).message });
    }
  }

  async refreshToken(req: FastifyRequest, reply: FastifyReply) {
    const { refreshToken } = req.body as { refreshToken: string };

    try {
      const { accessToken } =
        await authService.refreshAccessToken(refreshToken);
      reply.status(200).send({ accessToken });
    } catch (error) {
      reply.status(401).send({ error: (error as Error).message });
    }
  }

  async verifyToken(req: FastifyRequest, reply: FastifyReply) {
    const { token } = req.body as { token: string };

    try {
      const decoded = await authService.verifyToken(token);
      reply.status(200).send(decoded);
    } catch (error) {
      reply.status(401).send({ error: (error as Error).message });
    }
  }
}
