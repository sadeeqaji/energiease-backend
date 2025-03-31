import { cleanEnv, str, num } from 'envalid';

const env = cleanEnv(process.env, {
  MONGODB_URI: str(),
  HOST: str(),
  PORT: num({ default: 5000 }),
  NODE_ENV: str({ choices: ['development', 'production', 'staging'] }),
  META_ACCESS_TOKEN: str(),
  WHATSAPP_PHONE_ID: str(),
  VERIFY_TOKEN: str(),
  PASSPHRASE: str(),
  PRIVATE_KEY: str({ default: undefined }),
  META_APP_SECRET: str(),
  BUYPOWER_API_KEY: str(),
  BUYPOWER_BASE_URL: str(),
  MONNIFY_API_KEY: str(),
  MONNIFY_CLIENT_SECRET: str(),
  MONNIFY_CONTRACT_CODE: str(),
  MONNIFY_TIMEOUT: str(),
  MONNIFY_BASE_URL: str(),
  PAYSTACK_SECRET_KEY: str(),
  APPLICATIONINSIGHTS_CONNECTION_STRING: str(),
  KEY_VAULT_URL: str(),
  AZURE_REDIS_CONNECTIONSTRING: str({ default: undefined }),
  AZURE_TENANT_ID: str({ default: undefined }),
  AZURE_CLIENT_ID: str({ default: undefined }),
  AZURE_CLIENT_SECRET: str({ default: undefined }),
  FLOW_ID: str(),
  REDIS_CONNECTION_STRING: str(),
  REDIS_ACCESS_KEY: str(),
  SERVICE_BUS_CONNECTION_STRING: str(),
  SLACK_WEBHOOK_URL: str()
});

export default env;
