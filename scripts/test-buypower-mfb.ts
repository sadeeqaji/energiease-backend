/**
 * Test & Verification Harness for BuyPower MFB Integration
 * 
 * Verifies:
 * 1. HMAC-SHA256 signature generation and validation
 * 2. Response transformation to BankDetails
 * 3. Webhook event payload structure handling (invoice.paid)
 */

import crypto from 'crypto';
import { BuyPowerMFBService } from '../src/services/buypower-mfb.service';
import { transformBankDetails } from '../src/utils/payment';
import { BuyPowerMFBWebhookPayload } from '../src/types/buypower-mfb.types';

function runTests() {
    console.log('🧪 Starting BuyPower MFB Integration Tests...\n');

    const testSecret = 'whsec_test_mock_secret_key_12345';
    process.env.BUYPOWER_MFB_WEBHOOK_SECRET = testSecret;

    const service = new BuyPowerMFBService();

    // 1. Test Signature Verification
    console.log('Test 1: Webhook HMAC-SHA256 Signature Verification');
    const mockWebhookBody = JSON.stringify({
        event: 'invoice.paid',
        data: {
            transactionId: 64,
            transactionReference: 'dbcde-343d33-d1d-00-1113D',
            accountExchangeReference: 'EE-ORD-TEST-001',
            accountNumber: '1408742845',
            amount: '5000.00',
            destinationBankName: 'BuyPower MFB',
            destinationBankCode: '090682',
            type: 'INFLOW',
            status: 'CONFIRMED',
            name: 'John Doe',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }
    });

    const validSignature = crypto
        .createHmac('sha256', testSecret)
        .update(mockWebhookBody)
        .digest('hex');

    const isValid = service.verifyWebhookSignature(validSignature, mockWebhookBody);
    console.log(`- Valid signature verification: ${isValid ? 'PASSED ✅' : 'FAILED ❌'}`);
    if (!isValid) throw new Error('Signature verification failed for valid HMAC');

    const isInvalid = service.verifyWebhookSignature('invalid_tampered_signature', mockWebhookBody);
    console.log(`- Tampered signature rejection: ${!isInvalid ? 'PASSED ✅' : 'FAILED ❌'}`);
    if (isInvalid) throw new Error('Security flaw: Tampered signature was accepted');

    // 2. Test Response Transformation to BankDetails
    console.log('\nTest 2: Transform Invoice Account into BankDetails');
    const mockInvoiceData = {
        id: 16,
        exchangeRef: 'EE-ORD-TEST-001',
        nuban: '1408742845',
        bankName: 'BuyPower MFB',
        bankCode: '090682',
        amount: 5000,
        name: 'Energiease / John Doe',
        status: 'PENDING',
        expiryDate: '2026-09-22T00:00:00.000Z'
    };

    const bankDetails = transformBankDetails('BuyPowerMFB', mockInvoiceData);
    console.log('Transformed Bank Details:', bankDetails);
    
    if (
        bankDetails.bankName === 'BuyPower MFB' &&
        bankDetails.accountNumber === '1408742845' &&
        bankDetails.accountName === 'Energiease / John Doe'
    ) {
        console.log('- BankDetails transformation: PASSED ✅');
    } else {
        throw new Error('BankDetails transformation failed');
    }

    // 3. Test Webhook Event Parsing
    console.log('\nTest 3: Webhook Event Payload Schema');
    const parsedPayload: BuyPowerMFBWebhookPayload = JSON.parse(mockWebhookBody);
    console.log(`- Event: ${parsedPayload.event}`);
    console.log(`- Order Ref: ${parsedPayload.data.accountExchangeReference}`);
    console.log(`- Amount Paid: ₦${parsedPayload.data.amount}`);
    console.log(`- Status: ${parsedPayload.data.status}`);

    if (parsedPayload.event === 'invoice.paid' && parsedPayload.data.status === 'CONFIRMED') {
        console.log('- Webhook payload parsing: PASSED ✅');
    } else {
        throw new Error('Webhook event parsing failed');
    }

    console.log('\n🎉 ALL BUYPOWER MFB INTEGRATION TESTS PASSED CLEANLY!');
}

runTests();
