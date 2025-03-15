import { cleanEnv, str, num } from 'envalid';

const env = cleanEnv(process.env, {
  MONGODB_URI: str(),
  PORT: num({ default: 3000 }),
  NODE_ENV: str({ choices: ['development', 'production', 'test'] }),
  META_ACCESS_TOKEN: str(),
  WHATSAPP_PHONE_ID: str(),
  VERIFY_TOKEN: str(),
  PASSPHRASE: str(),
  META_APP_SECRET: str(),
  PRIVATE_KEY: str(),
  BUYPOWER_API_KEY: str(),
  BUYPOWER_BASE_URL: str(),
  MONNIFY_API_KEY: str(),
  MONNIFY_CLIENT_SECRET: str(),
  MONNIFY_CONTRACT_CODE: str(),
  MONNIFY_TIMEOUT: str(),
  PAYSTACK_SECRET_KEY: str(),
});

export default env;
