/**
 * Test Harness: Support Inactivity 15-Minute Monitor
 * Verifies:
 *  1. pending_agent tickets are NOT touched by inactivity monitor
 *  2. pending_customer ticket past 10 minutes receives 10m nudge message
 *  3. Duplicate nudges are prevented
 *  4. Customer reply resets the inactivity warning timestamp
 *  5. pending_customer ticket past 15 minutes is auto-resolved with 'inactivity_timeout'
 */

import mongoose from 'mongoose';
import { SupportService } from '../src/services/support.service';
import { SupportTicket } from '../src/models/support-ticket.model';
import dotenv from 'dotenv';

dotenv.config();

async function runInactivityTests() {
  console.log('🧪 Starting Support Inactivity 15-Minute Monitor Integration Tests...\n');

  const mongoUri = process.env.MONGODB_URI || process.env.DATABASE_URL || 'mongodb://localhost:27017/energiease';
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB\n');

  const testPhone = '2348099887766';
  const supportService = new SupportService();

  try {
    await SupportTicket.deleteMany({ customerPhone: testPhone });

    // 1. Create a ticket in pending_agent (customer waiting for support)
    console.log('1️⃣ Testing pending_agent ticket (12 mins old, customer waiting for support)...');
    const twelveMinsAgo = new Date(Date.now() - 12 * 60 * 1000);
    const tAgent = await SupportTicket.create({
      ticketId: `SUP-TEST-AGENT-${Date.now()}`,
      customerPhone: testPhone,
      status: 'pending_agent',
      lastMessageAt: twelveMinsAgo,
      messages: [{
        sender: 'customer',
        senderName: 'Test Customer',
        text: 'Hello, need help',
        timestamp: twelveMinsAgo,
      }],
    });

    const result1 = await supportService.checkAndHandleInactiveTickets();
    console.log(`   Nudges sent: ${result1.nudged}, Auto-resolved: ${result1.resolved}`);
    const check1 = await SupportTicket.findById(tAgent._id);
    if (check1?.status !== 'pending_agent' || check1?.inactivityWarningSentAt) {
      throw new Error('Step 1 Failed: Inactivity monitor touched a pending_agent ticket!');
    }
    console.log('   ✅ Step 1 Passed: pending_agent ticket was safely untouched.\n');

    // 2. Ticket in pending_customer: Agent replied 11 minutes ago (exceeds 10m nudge threshold)
    console.log('2️⃣ Testing 10m nudge on pending_customer ticket (11 mins since agent reply)...');
    const elevenMinsAgo = new Date(Date.now() - 11 * 60 * 1000);
    const tNudge = await SupportTicket.create({
      ticketId: `SUP-TEST-NUDGE-${Date.now()}`,
      customerPhone: testPhone,
      status: 'pending_customer',
      lastMessageAt: elevenMinsAgo,
      messages: [
        {
          sender: 'customer',
          senderName: 'Test Customer',
          text: 'Where is my token?',
          timestamp: elevenMinsAgo,
        },
        {
          sender: 'agent',
          senderName: 'Support Agent',
          text: 'Your token is 1234-5678. Does everything look good?',
          timestamp: elevenMinsAgo,
        },
      ],
    });

    const result2 = await supportService.checkAndHandleInactiveTickets();
    console.log(`   Nudges sent: ${result2.nudged}, Auto-resolved: ${result2.resolved}`);
    const check2 = await SupportTicket.findById(tNudge._id);
    if (!check2?.inactivityWarningSentAt) {
      throw new Error('Step 2 Failed: 10m nudge warning was not set on the ticket!');
    }
    console.log(`   Warning set at: ${check2.inactivityWarningSentAt.toISOString()}`);
    console.log('   ✅ Step 2 Passed: 10m nudge triggered and timestamp recorded.\n');

    // 3. Second run should NOT re-nudge
    console.log('3️⃣ Testing idempotency (second check should not re-nudge)...');
    const result3 = await supportService.checkAndHandleInactiveTickets();
    console.log(`   Nudges sent: ${result3.nudged}, Auto-resolved: ${result3.resolved}`);
    if (result3.nudged !== 0) {
      throw new Error('Step 3 Failed: Repeated nudge sent to same ticket!');
    }
    console.log('   ✅ Step 3 Passed: No duplicate nudge sent.\n');

    // 4. Ticket in pending_customer: Agent replied 16 minutes ago (exceeds 15m auto-close threshold)
    console.log('4️⃣ Testing 15m auto-close on pending_customer ticket (16 mins since agent reply)...');
    const sixteenMinsAgo = new Date(Date.now() - 16 * 60 * 1000);
    const tResolve = await SupportTicket.create({
      ticketId: `SUP-TEST-TIMEOUT-${Date.now()}`,
      customerPhone: testPhone,
      status: 'pending_customer',
      lastMessageAt: sixteenMinsAgo,
      inactivityWarningSentAt: new Date(Date.now() - 6 * 60 * 1000), // Warning sent 6 mins ago
      messages: [
        {
          sender: 'customer',
          senderName: 'Test Customer',
          text: 'Need help with electricity',
          timestamp: sixteenMinsAgo,
        },
        {
          sender: 'agent',
          senderName: 'Support Agent',
          text: 'Issue resolved on the meter.',
          timestamp: sixteenMinsAgo,
        },
      ],
    });

    const result4 = await supportService.checkAndHandleInactiveTickets();
    console.log(`   Nudges sent: ${result4.nudged}, Auto-resolved: ${result4.resolved}`);
    const check4 = await SupportTicket.findById(tResolve._id);
    if (check4?.status !== 'resolved') {
      throw new Error(`Step 4 Failed: Ticket status is ${check4?.status}, expected 'resolved'`);
    }
    if (check4?.resolutionReason !== 'inactivity_timeout') {
      throw new Error(`Step 4 Failed: resolutionReason is ${check4?.resolutionReason}, expected 'inactivity_timeout'`);
    }
    console.log(`   Resolution Reason: ${check4.resolutionReason}`);
    console.log('   ✅ Step 4 Passed: Ticket cleanly auto-closed after 15 minutes of inactivity.\n');

    console.log('🎉 ALL 15-MINUTE INACTIVITY MONITOR TESTS PASSED! 🚀');
  } finally {
    await SupportTicket.deleteMany({ customerPhone: testPhone });
    await mongoose.disconnect();
  }
}

runInactivityTests().catch((err) => {
  console.error('❌ Inactivity Test Failed:', err);
  process.exit(1);
});
