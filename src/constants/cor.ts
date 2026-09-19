export const corsOptions = {
    origin: (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => {
        // Allow requests with no origin (like mobile apps, curl, server-to-server)
        if (!origin) return cb(null, true);

        const allowed = [
            'https://energiease.ng',
            'https://www.energiease.ng',
            'https://admin.energiease.ng',
            'https://api.energiease.ng',
            'https://staging-api.energiease.ng',
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:5173',
        ];

        if (allowed.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin)) {
            return cb(null, true);
        }

        // Permissive for other web clients
        return cb(null, true);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
    credentials: true,
    maxAge: 86400,
};