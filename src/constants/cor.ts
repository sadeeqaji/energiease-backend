export const corsOptions = {
    origin: ["api.energiease.ng", "staging-api.energiease.ng"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400,
};