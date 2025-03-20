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
  META_APP_SECRET: str(),
  BUYPOWER_API_KEY: str(),
  BUYPOWER_BASE_URL: str(),
  MONNIFY_API_KEY: str(),
  MONNIFY_CLIENT_SECRET: str(),
  MONNIFY_CONTRACT_CODE: str(),
  MONNIFY_TIMEOUT: str(),
  PAYSTACK_SECRET_KEY: str(),
  APPINSIGHTS_INSTRUMENTATION_KEY: str(),
  KEY_VAULT_URL: str(),
  AZURE_TENANT_ID: str({ default: undefined }),
  AZURE_CLIENT_ID: str({ default: undefined }),
  AZURE_CLIENT_SECRET: str({ default: undefined }),
  FLOW_ID: str()
});

export default env;
