import { env } from "@/config";
import { ElectricityPurchaseConfirmationParams } from "@/types/whatsapp.types";

export const KYC_FLOW_MESSAGE = (to: string) => ({
  messaging_product: 'whatsapp',
  to,
  type: 'interactive',
  interactive: {
    type: 'flow',
    header: {
      type: 'text',
      text: 'Welcome to Energiease! 🌟',
    },
    body: {
      text: 'Get access to Shariah - compliant financing with ease. No interest, no hidden fees, just ethical financial solutions for you. Tap the button below to get started!',
    },
    footer: {
      text: 'Click the button below to proceed',
    },
    action: {
      name: 'flow',
      parameters: {
        ...(env.FLOW_MODE === 'draft' ? { mode: 'draft' } : {}),
        flow_id: '2954602864703606',
        flow_message_version: '3',
        flow_token: 'kyc',
        flow_cta: 'Get Started',
        flow_action: 'navigate',
        flow_action_payload: {
          screen: 'ENTER_BVN',
          data: {
            phone_number: to,
          },
        },
      },
    },
  },
});

export const MENU_MESSAGE = (to: string) => ({
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": to,
  "type": "interactive",
  "interactive": {
    "type": "list",
    "body": {
      "text": "⚡ Welcome to EnergiEase! How would you like to proceed?"
    },
    "footer": {
      "text": "Select an option below"
    },
    "action": {
      "button": "Choose an option",
      "sections": [
        {
          "title": "Electricity Purchase",
          "rows": [
            {
              "id": "buy_again",
              "title": "🔁 Buy Again",
              "description": "Purchase electricity for a saved meter"
            },
            {
              "id": "new_meter",
              "title": "🔢 Enter New Meter",
              "description": "Purchase electricity for a new meter"
            }
          ]
        }
      ]
    }
  }
});


export const GET_STARTED = (to: string) => ({
  messaging_product: 'whatsapp',
  to,
  type: 'interactive',
  interactive: {
    type: 'flow',
    header: {
      type: 'text',
      text: '💡 Welcome to Energiease! ⚡',
    },
    body: {
      text: 'Hi there! 👋 You’re just a few taps away from seamless electricity purchase.',
    },
    footer: {
      text: 'Need help? Reply SUPPORT • Quick & easy! ⚡',
    },
    action: {
      name: 'flow',
      parameters: {
        ...(env.FLOW_MODE === 'draft' ? { mode: 'draft' } : {}),
        flow_id: env.FLOW_ID,
        flow_message_version: '3',
        flow_token: 'menu',
        flow_cta: 'Purchase Electricity',
        flow_action: 'navigate',
        flow_action_payload: {
          screen: 'WELCOME_SCREEN',
          data: {
            phone_number: to,
          },
        },
      },
    },
  },
});


// export const ELECTRICITY_PURCHASE_CONFIRMATION = ({
//   to,
//   amount,
//   meterNumber,
//   disco,
//   token,
//   unit,
//   orderReference,
// }: ElectricityPurchaseConfirmationParams) => ({
//   messaging_product: 'whatsapp',
//   to,
//   type: 'template',
//   "template": {
//     "name": "electricity_purchased_confirmed",
//     "language": {
//       "code": "en"
//     },
//     "components": [
//       {
//         "type": "body",
//         "parameters": [
//           {
//             type: "text",
//             parameter_name: "1",
//             "text": amount
//           },
//           {
//             type: "text",
//             parameter_name: "2",
//             "text": token
//           },
//           {
//             "type": "text",
//             parameter_name: "3",
//             "text": unit
//           },
//           {
//             "type": "text",
//             parameter_name: "4",
//             "text": amount
//           },
//           {
//             "type": "text",
//             parameter_name: "5",
//             "text": meterNumber
//           },
//           {
//             "type": "text",
//             parameter_name: "6",
//             "text": disco
//           },
//           {
//             "type": "text",
//             parameter_name: "7",
//             "text": orderReference
//           },
//           {
//             "type": "text",
//             parameter_name: "8",
//             "text": "+2347067307317"
//           }
//         ]
//       }
//     ]
//   }
// });




export const WELCOME_MESSAGE = (to: string) => ({
  type: 'text',
  messaging_product: 'whatsapp',
  to,
  text: {
    body: 'Welcome to our service! How can we assist you today?',
  },
});

export const HELP_MESSAGE = {
  type: 'text',
  text: {
    body: 'Here are some commands you can use:\n1. Start KYC\n2. Check Status\n3. Contact Support',
  },
};

export const ERROR_MESSAGE = {
  type: 'text',
  text: {
    body: 'Oops! Something went wrong. Please try again later.',
  },
};

export const PAYMENT_INSTRUCTIONS_MESSAGE = ({
  to,
  totalAmount,
  bankName,
  accountNumber,
  accountName,
  paymentUrl,
}: {
  to: string;
  totalAmount: string | number;
  bankName: string;
  accountNumber: string;
  accountName: string;
  paymentUrl?: string;
}) => {
  const cleanTo = String(to).replace(/[^0-9]/g, '');
  const formattedAmount =
    typeof totalAmount === 'number'
      ? totalAmount.toLocaleString()
      : String(totalAmount);

  if (paymentUrl) {
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        header: {
          type: 'text',
          text: '⚡ Complete Your Payment',
        },
        body: {
          text:
            `💰 Amount to Pay: *₦${formattedAmount}*\n\n` +
            `*Dedicated Bank Transfer Details:*\n` +
            `🏦 Bank: *${bankName}*\n` +
            `🔢 Account Number: \`${accountNumber}\`\n` +
            `👤 Account Name: *${accountName}*\n` +
            `⏳ Expires in: *30 mins*\n\n` +
            `💡 *Tap the account number above to copy it instantly!*\n` +
            `Or tap the button below to pay online via Card or Bank Transfer:`,
        },
        action: {
          name: 'cta_url',
          parameters: {
            display_text: 'Pay Online Now 💳',
            url: paymentUrl,
          },
        },
        footer: {
          text: 'Token delivered automatically upon payment',
        },
      },
    };
  }

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanTo,
    type: 'text',
    text: {
      body:
        `⚡ *Energiease Payment Details*\n\n` +
        `💰 Amount to Pay: *₦${formattedAmount}*\n\n` +
        `*Dedicated Bank Transfer Details:*\n` +
        `🏦 Bank: *${bankName}*\n` +
        `🔢 Account Number: \`${accountNumber}\`\n` +
        `👤 Account Name: *${accountName}*\n` +
        `⏳ Expires in: *30 mins*\n\n` +
        `💡 *Tap the account number above to copy it instantly!*\n\n` +
        `Your electricity token will be delivered right here in this chat as soon as payment is confirmed.`,
    },
  };
};

export const TRANSACTION_IS_BEING_VERIFIED = ({
  to,
  orderReference
}: { to: string; orderReference: string }) => ({
  messaging_product: "whatsapp",
  to,
  type: "text",
  text: {
    body: `Your payment is currently being verified. This process usually takes a few minutes.  

You'll receive a confirmation *right here in this chat* once it's verified, and we'll proceed with your electricity purchase.  

*Transaction ID:* ${orderReference}  

Thank you for choosing Energiease! ⚡`
  }
});




export const SAVED_METER_NO = () => ({
  messaging_product: "whatsapp",
  recipient_type: "individual",
  to: '+2347019438856',
  type: "interactive",
  interactive: {
    type: "list",
    body: {
      text: "⚡ Select a saved meter to buy electricity:"
    },
    action: {
      button: "Select Meter",
      sections: [
        {
          title: "Your Saved Meters",
          rows: [
            {
              id: '112233445566',
              title: 'Home Meter',
              description: '123 Main St, Lagos | 112233445566'
            },
            {
              id: '778899001122',
              title: 'Office Meter',
              description: '456 Broad St, Abuja | 778899001122'
            }
          ]
        }]
    }
  }
})

export const expectedEmptyResponse = {
  type: "text",
  text: "You don't have any saved meters. Please enter a new meter to purchase electricity."
};


export const formatTokenForCopy = (rawToken: string | undefined): string => {
  if (!rawToken) return 'PENDING_GENERATION';
  const clean = rawToken.replace(/\D/g, '');
  if (clean.length === 20) {
    return clean.match(/.{1,4}/g)?.join('-') || rawToken;
  }
  return rawToken;
};

export const ELECTRICITY_PURCHASE_CONFIRMATION = ({
  to,
  amount,
  meterNumber,
  disco,
  token,
  unit,
  orderReference,
}: ElectricityPurchaseConfirmationParams) => {
  const formattedToken = formatTokenForCopy(token);
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: {
      body: `🎉 *ELECTRICITY TOKEN READY!* ⚡

Tap the token below to copy with 1 tap:
\`\`\`
${formattedToken}
\`\`\`

━━━━━━━━━━━━━━━━━━━━━
👤 *Meter:* ${meterNumber} (${disco})
⚡ *Units:* ${unit || 'N/A'} kWh
💰 *Amount Paid:* ₦${!isNaN(Number(amount)) ? Number(amount).toLocaleString() : amount}
🧾 *Order Ref:* ${orderReference}
━━━━━━━━━━━━━━━━━━━━━

💡 *How to load your token:*
1. Key in the 20 digits above on your meter UI.
2. Press the blue or enter button.
3. Your units will update immediately!

Need help? Reply *HELP* or call 📞 07067307317
Thank you for using Energiease! 🚀`,
    },
  };
};

export const DISCO_RESTORED_NOTIFICATION = ({
  to,
  discoName,
  discoCode,
}: {
  to: string;
  discoName: string;
  discoCode: string;
}) => ({
  messaging_product: 'whatsapp',
  to,
  type: 'text',
  text: {
    body: `🟢 *Good News!* ⚡

*${discoName}* vending servers are now back online and running smoothly.

You can now purchase your electricity token without delays. Tap the button below to buy now!`,
  },
});

export const PAYMENT_RECEIVED = ({
  to,
  amount,
  orderReference,
}: Omit<ElectricityPurchaseConfirmationParams, 'token' | 'unit' | 'meterNumber' | 'disco'>) => ({
  messaging_product: 'whatsapp',
  to,
  type: 'text',
  text: {
    body: `⚡ *Payment Confirmed!* ⚡

✅ Your payment of *₦${amount.toLocaleString()}* was successful!

We're preparing your electricity token and will send it to you shortly.

📌 *Reference:* ${orderReference}

Thank you for choosing Energiease! 

Need help? Reply to this message or contact us:
📞 07067307317`,
  },
});

export const SUPPORT_WELCOME_MESSAGE = (to: string, ticketId: string) => ({
  messaging_product: 'whatsapp',
  recipient_type: 'individual',
  to,
  type: 'text',
  text: {
    body: `🎧 *EnergiEase Customer Care*\n\nYour support ticket (*#${ticketId}*) is active. A support agent has been notified and will respond shortly.\n\nPlease describe your issue or share your meter number below.\n\n_Tip: Reply *EXIT* at any time to return to the vending menu._`,
  },
});

export const SUPPORT_AGENT_REPLY_MESSAGE = (to: string, agentName: string, text: string) => ({
  messaging_product: 'whatsapp',
  recipient_type: 'individual',
  to,
  type: 'text',
  text: {
    body: `👨‍💼 *Support Agent (${agentName})*:\n\n${text}\n\n_Reply to this message to continue chatting with support._`,
  },
});

export const SUPPORT_RESOLVED_MESSAGE = (to: string, ticketId: string) => ({
  messaging_product: 'whatsapp',
  recipient_type: 'individual',
  to,
  type: 'text',
  text: {
    body: `✅ *Ticket #${ticketId} Resolved*\n\nYour support session has been completed. Thank you for choosing EnergiEase!\n\nWhenever you're ready to purchase electricity tokens, simply reply *Hi* or tap below! ⚡`,
  },
});