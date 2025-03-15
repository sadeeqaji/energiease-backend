
export interface WhatsAppMessage {
  from: string;
  text?: { body: string };
  interactive: Record<string, any>;
}

export interface WhatsAppEntry {
  entry: {
    changes: {
      value: { messages?: WhatsAppMessage[] };
    }[];
  }[];
}

export type WhatsAppMedia = {
  file_name: string;
  media_id: string;
  cdn_url: string;
  encryption_metadata: {
    encrypted_hash: string;
    encryption_key: string;
    hmac_key: string;
    hmac: string;
    iv: string;
    plaintext_hash: string;
  };
};

export interface DecryptedResponse {
  action: string;
  data: {
    address: string;
    meter_name: string;
    phone_number: string;
    meter_no: string;
    disco: string;
    vend_type: string;
    amount: number;
    service_charge: string;
    selected_action: 'SAVED_METERS' | 'ENTER_METER_NO',
    selected_meter: string;
  };
  flow_token: string;
  screen: string;
}

export interface ElectricityPurchaseConfirmationParams {
  to: string;
  amount: string;
  meterNumber: string;
  disco: string;
  token: string;
  unit: string;
  orderReference: string;
}