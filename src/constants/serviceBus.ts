export const ServiceBusQueues = {
    WHATSAPP_NOTIFICATIONS: 'whatsapp-notifications',
    ORDER_PROCESSING: 'order-processing',
    PAYMENT_EVENTS: 'payment-events',
    METER_VALIDATION: 'meter-validation'
} as const;

export type ServiceBusQueue = keyof typeof ServiceBusQueues;