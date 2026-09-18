import 'dotenv/config';
import mongoose from 'mongoose';
import { env } from '../src/config';
import OrderModel from '../src/models/order.model';
import { BuyPowerProvider } from '../src/services/providers/buypower';
import { BillType } from '../src/types/bill.types';

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    await mongoose.connect(env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const provider = new BuyPowerProvider();

    if (command === '--list' || !command) {
        console.log('🔍 Finding orders requiring fulfillment...');
        const orders = await OrderModel.find({
            $or: [
                { requiresManualIntervention: true },
                { status: 'processing', paymentConfirmedAt: { $exists: true } },
                { 'providerResponse.error': /insufficient|wallet|balance/i },
                { fulfillmentFailureReason: /insufficient|wallet|balance/i }
            ]
        }).sort({ createdAt: -1 });

        console.log(`Found ${orders.length} order(s):\n`);
        orders.forEach(o => {
            const electricity = o.details as any;
            console.log(`- Ref: ${o.reference}`);
            console.log(`  Amount: ₦${o.amount.toLocaleString()} (Service Fee: ₦${o.serviceFee})`);
            console.log(`  Phone: ${o.customerPhone}`);
            console.log(`  Meter: ${electricity?.meterNumber} (${electricity?.disco})`);
            console.log(`  Status: ${o.status}`);
            console.log(`  Reason: ${(o.providerResponse as any)?.error || o.fulfillmentFailureReason || 'N/A'}`);
            console.log(`  Date: ${o.createdAt}`);
            console.log('--------------------------------------------------');
        });

        if (!command && orders.length > 0) {
            console.log('\nUsage:');
            console.log('  npx tsx scripts/retry-vend.ts <ORDER_REFERENCE>  # Retry a specific order');
            console.log('  npx tsx scripts/retry-vend.ts --all              # Retry all pending orders');
        }
        await mongoose.disconnect();
        return;
    }

    const references = command === '--all' 
        ? (await OrderModel.find({
            $or: [
                { requiresManualIntervention: true },
                { status: 'processing' },
                { 'providerResponse.error': /insufficient|wallet|balance/i },
                { fulfillmentFailureReason: /insufficient|wallet|balance/i }
            ]
        })).map(o => o.reference)
        : [command];

    for (const ref of references) {
        console.log(`\n⚡ Processing re-vend for: ${ref}...`);
        const order = await OrderModel.findOne({ reference: ref });
        if (!order) {
            console.error(`❌ Order not found: ${ref}`);
            continue;
        }

        if (order.status === 'success') {
            console.log(`ℹ️ Order ${ref} is already successfully vended.`);
            continue;
        }

        try {
            const electricityDetails = order.details as any;
            const providerAmount = order.amount - order.serviceFee;

            const vendResult = await provider.vend({
                amount: providerAmount,
                billType: order.type,
                orderReference: order.reference,
                details: order.details,
                userInfo: { phone: order.customerPhone }
            });

            if (vendResult.success) {
                await OrderModel.findByIdAndUpdate(order._id, {
                    status: 'success',
                    provider: 'buypower',
                    providerOrderId: vendResult.orderId,
                    requiresManualIntervention: false,
                    fulfillmentFailureReason: undefined,
                    providerResponse: { success: true },
                });
                console.log(`🎉 SUCCESS! Order ${ref} vended successfully (BuyPower Order ID: ${vendResult.orderId}). Token sent to customer WhatsApp.`);
            } else {
                console.error(`❌ Vending unsuccessful for ${ref}`);
            }
        } catch (err: any) {
            console.error(`❌ Vending failed for ${ref}:`, err.message || err);
            await OrderModel.findByIdAndUpdate(order._id, {
                fulfillmentFailureReason: err.message || 'Retry error',
                $inc: { retries: 1 }
            });
        }
    }

    await mongoose.disconnect();
    console.log('\nDone.');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
