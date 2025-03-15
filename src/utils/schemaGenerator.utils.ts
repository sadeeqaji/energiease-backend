import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

type ZodResponseSchema = z.ZodObject<z.ZodRawShape> | z.ZodArray<z.ZodTypeAny>;

interface CreateRouteSchemaOptions {
  tags: string[];
  summary: string;
  description: string;
  query?: z.ZodObject<z.ZodRawShape>;
  params?: z.ZodObject<z.ZodRawShape>;
  body?: z.ZodObject<z.ZodRawShape>;
  response?: Record<number, ZodResponseSchema>;
}

export const createRouteSchema = (options: CreateRouteSchemaOptions) => {
  const { tags, summary, description, query, params, body, response } = options;

  return {
    tags,
    summary,
    description,
    ...(query && { querystring: zodToJsonSchema(query) }),
    ...(params && { params: zodToJsonSchema(params) }),
    ...(body && { body: zodToJsonSchema(body) }),
    ...(response && {
      response: Object.fromEntries(
        Object.entries(response).map(([statusCode, schema]) => [
          statusCode,
          zodToJsonSchema(schema),
        ]),
      ),
    }),
  };
};
