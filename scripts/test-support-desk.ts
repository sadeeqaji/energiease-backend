/**
 * Test Harness: Native Support Desk & WhatsApp Live Chat Lifecycle
 * Verifies:
 *  1. Automatic ticket creation upon receiving support request
 *  2. Message appending & queue categorization
 *  3. Agent reply dispatch to customer
 *  4. Ticket resolution and session release
 */

import mongoose from 'mongoose';
import { SupportService } from '../src/services/support.service';
import { SupportTicket } from '../src/models/support-ticket.model';
import dotenv from 'dotenv';

dotenv.config();

async function runTests() {
  console.log('🧪 Starting Native Support Desk Integration Tests...\n');

  const mongoUri = process.env.MONGODB_URI || process.env.DATABASE_URL || 'mongodb://localhost:27017/energiease';
  console.log(`Connecting to MongoDB...`);
  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB\n');

  const testPhone = '2348011223344';
  const supportService = new SupportService();

  try {
    // Clean up test data
    await SupportTicket.deleteMany({ customerPhone: testPhone });

    // Step 1: Customer initiates support
    console.log('1️⃣ Customer texts: "Hello, I need support with my token"');
    const { ticket: t1, isNew } = await supportService.handleIncomingCustomerMessage(
      testPhone,
      'Hello, I need support with my token'
    );

    console.log(`   Created Ticket: ${t1.ticketId}`);
    console.log(`   Status: ${t1.status}`);
    console.log(`   Is New Ticket: ${isNew}`);
    console.log(`   Messages count: ${t1.messages.length}`);
    if (!isNew || t1.status !== 'pending_agent') {
      throw new Error('Step 1 Failed: Ticket was not created as pending_agent');
    }
    console.log('   ✅ Step 1 Passed\n');

    // Step 2: Customer sends follow-up
    console.log('2️⃣ Customer follow-up: "My meter is 45012345678"');
    const { ticket: t2, isNew: isNew2 } = await supportService.handleIncomingCustomerMessage(
      testPhone,
      'My meter is 45012345678'
    );

    console.log(`   Same Ticket ID: ${t2.ticketId}`);
    console.log(`   Is New Ticket: ${isNew2}`);
    console.log(`   Messages count: ${t2.messages.length}`);
    if (isNew2 || t2.messages.length !== 2) {
      throw new Error('Step 2 Failed: Message was not appended to existing ticket');
    }
    console.log('   ✅ Step 2 Passed\n');

    // Step 3: Admin Support Desk Queries Tickets
    console.log('3️⃣ Admin Desk fetches active tickets list...');
    const queue = await supportService.getTickets({ status: 'active' });
    console.log(`   Total Active Tickets: ${queue.counts.totalActive}`);
    console.log(`   Needs Agent Reply: ${queue.counts.pending_agent}`);
    const found = queue.tickets.find((t) => t.ticketId === t1.ticketId);
    if (!found) {
      throw new Error('Step 3 Failed: Created ticket not found in active queue');
    }
    console.log('   ✅ Step 3 Passed\n');

    // Step 4: Agent replies
    console.log('4️⃣ Support Agent replies from dashboard: "We are checking with AEDC now"');
    const t3 = await supportService.sendAgentReply(
      t1.ticketId,
      'Sadiq Support',
      'We are checking with AEDC now. Please allow 1 minute.'
    );

    console.log(`   Status after reply: ${t3.status}`);
    console.log(`   Messages count: ${t3.messages.length}`);
    const lastMsg = t3.messages[t3.messages.length - 1];
    console.log(`   Last message sender: ${lastMsg.sender} (${lastMsg.senderName})`);
    if (t3.status !== 'pending_customer' || lastMsg.sender !== 'agent') {
      throw new Error('Step 4 Failed: Agent reply did not update ticket status to pending_customer');
    }
    console.log('   ✅ Step 4 Passed\n');

    // Step 5: Agent resolves ticket
    console.log('5️⃣ Agent resolves ticket...');
    const t4 = await supportService.resolveTicket(t1.ticketId, 'Sadiq Support');
    console.log(`   Final Status: ${t4.status}`);
    if (t4.status !== 'resolved') {
      throw new Error('Step 5 Failed: Ticket was not marked as resolved');
    }
    console.log('   ✅ Step 5 Passed\n');

    console.log('🎉 ALL NATIVE SUPPORT DESK TESTS PASSED SUCCESSFULLY! 🚀');
  } finally {
    await SupportTicket.deleteMany({ customerPhone: testPhone });
    await mongoose.disconnect();
  }
}

runTests().catch((err) => {
  console.error('❌ Test Failed:', err);
  process.exit(1);
});
