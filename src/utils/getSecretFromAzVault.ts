import { env } from "@/config";
import { DefaultAzureCredential, ClientSecretCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";

const keyVaultUrl = process.env.KEY_VAULT_URL!
const secretName = "WhatsAppPrivateKey";

const credential = env.NODE_ENV === 'production' || env.NODE_ENV === 'staging'
    ? new DefaultAzureCredential()
    : new ClientSecretCredential(
        env.AZURE_TENANT_ID!,
        env.AZURE_CLIENT_ID!,
        env.AZURE_CLIENT_SECRET!
    );

console.log(env.NODE_ENV, 'env.NODE_ENV')

const client = new SecretClient(keyVaultUrl, credential);

export async function getSecret(): Promise<string | undefined> {
    try {
        const secret = await client.getSecret(secretName);
        return secret.value;
    } catch (error) {
        console.log("Error fetching secret:", error);
        throw error;
    }
}