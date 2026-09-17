import { env } from "@/config";

export async function getSecret(): Promise<string | undefined> {
    return env.PRIVATE_KEY || process.env.PRIVATE_KEY;
}