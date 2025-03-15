import SpendingRecordModel from '@/models/spendingRecord.model';
import { AppException } from '@/utils/appException.utils';

/**
 * Process the webhook event based on its type.
 * @param event - The webhook event payload.
 */
export interface WebhookEvent {
    event: string;
    data: unknown;
}

export async function processWebhookEvent(event: WebhookEvent) {
    const eventType = event.event;
    const data = event.data;
    switch (eventType) {
        case 'transaction.success':
            await handleSuccessfulTransaction(data as Transaction);
            break;

        case 'transaction.failed':
            await handleFailedTransaction(data as Transaction);
            break;

        case 'card.issued':
            await handleCardIssuance(data);
            break;

        default:
            console.warn(`Unhandled event type: ${eventType}`);
            break;
    }
}

/**
 * Handle successful transaction events.
 * @param transaction - The transaction data.
 */
interface Transaction {
    id: string;
}

async function handleSuccessfulTransaction(transaction: Transaction) {
    // Example: Update the transaction status in your database
    const spendingRecord = await SpendingRecordModel.findOneAndUpdate(
        { transactionId: transaction.id },
        { status: 'completed' },
        { new: true },
    );

    if (!spendingRecord) {
        throw AppException.NotFound('Spending record not found');
    }

    console.log('Updated spending record:', spendingRecord);
}

/**
 * Handle failed transaction events.
 * @param transaction - The transaction data.
 */
async function handleFailedTransaction(transaction: Transaction) {
    // Example: Update the transaction status in your database
    const spendingRecord = await SpendingRecordModel.findOneAndUpdate(
        { transactionId: transaction.id },
        { status: 'failed' },
        { new: true },
    );

    if (!spendingRecord) {
        throw AppException.NotFound('Spending record not found');
    }

    console.log('Updated spending record:', spendingRecord);
}

/**
 * Handle card issuance events.
 * @param card - The card data.
 */
async function handleCardIssuance(card: unknown) {
    // Example: Save the card details to your database
    console.log('Card issued:', card);
}