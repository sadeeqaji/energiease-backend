import { env } from "@/config";
import { DefaultAzureCredential, ClientSecretCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";

const keyVaultUrl = env.KEY_VAULT_URL!
const secretName = "WhatsAppPrivateKey";

const credential = env.NODE_ENV === 'production' || env.NODE_ENV === 'staging'
    ? new DefaultAzureCredential()
    : new ClientSecretCredential(
        env.AZURE_TENANT_ID!,
        env.AZURE_CLIENT_ID!,
        env.AZURE_CLIENT_SECRET!
    );


const client = new SecretClient(keyVaultUrl, credential);

export async function getSecret(): Promise<string | undefined> {
    try {
        if (env.NODE_ENV !== 'production') {
            return env.PRIVATE_KEY
        }
        const secret = await client.getSecret(secretName);
        return secret.value;
    } catch (error) {
        throw error;
    }
}