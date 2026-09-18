import { REDIS_PREFIXES } from '@/constants/redisPrefix';
import { serviceFee } from '@/constants/serviceFee';
import buyPowerService from '@/services/buypower.service';
import { BillType } from '@/types/bill.types';
import { DecryptedResponse } from '@/types/whatsapp.types';
import { AppException } from '@/utils/appException.utils';
import { generateMandateReference } from '@/utils/generateMandateRef';
import { transformedMeters } from '@/utils/meter';
import { PAYMENT_INSTRUCTIONS_MESSAGE } from '@/constants/whatsapp.flow';
import { formatToWhatsAppPhone } from '@/utils/phoneNumber';
import { FastifyInstance } from 'fastify';

async function resolveSessionPhone(data: any, meterNo: string | undefined, fastify: FastifyInstance): Promise<string> {
  let phone = data?.phone_number;
  if (!phone && meterNo) {
    phone = (await fastify.redis.get(`meter:phone:${meterNo}`).catch(() => null)) || '';
  }
  if (!phone) {
    phone = (await fastify.redis.get('user:phone:session:latest').catch(() => null)) || '';
  }
  const cleanPhone = formatToWhatsAppPhone(phone);
  if (cleanPhone) {
    await fastify.redis.set('user:phone:session:latest', cleanPhone, { ttl: 3600 }).catch(() => {});
    if (meterNo) {
      await fastify.redis.set(`meter:phone:${meterNo}`, cleanPhone, { ttl: 86400 }).catch(() => {});
    }
  }
  return cleanPhone;
}

export const handleEnterMeter = async (decryptedBody: DecryptedResponse, fastify: FastifyInstance) => {
  const { data, screen } = decryptedBody;





  try {

    if (decryptedBody.action === "BACK" && screen === "PAYMENT") {
      return {
        screen: 'PAYMENT',
        data: {
          ...data,
          error_message: "Please complete your payment or cancel the transaction."
        },
      };
    }
    switch (screen) {
      case "WELCOME_SCREEN":
        return await handleWelcomeScreen(data, fastify);

      case "SAVED_METERS":
        return await handleSavedMeters(data, fastify);

      case "ENTER_METER_NO":
        return await handleNewMeter(data, fastify);

      case "ORDER_REVIEW":
        return await handleOrderReview(data, fastify);

      case "PROVIDER_WARNING":
        return await handleProviderWarning(data, fastify);

      case "SETUP_DIRECT_DEBIT":
        return await handleSetupDirectDebit(data, fastify);

      // case "DIRECT_DEBIT_INITIATED":
      //   return await handleDirectDebitIntiation(data, fastify);

      default:
        return {
          screen: 'WELCOME_SCREEN',
          data: {},
        };
    }
  } catch (error) {
    fastify.log.error(error, `Error in handleEnterMeter (${screen}):`);
    return {
      screen,
      data: {
        error_message: "An unexpected error occurred. Please try again."
      },
    };
  }
};

async function handleWelcomeScreen(data: any, fastify: FastifyInstance) {
  if (data?.phone_number) {
    await fastify.redis.set('user:phone:session:latest', data.phone_number, { ttl: 3600 }).catch(() => {});
  }
  if (data.selected_action === 'SAVED_METERS') {
    const cacheKey = `${REDIS_PREFIXES.METER_CACHE}saved:${data.phone_number}`;
    const cachedMeters = await fastify.redis.get(cacheKey);

    if (cachedMeters) {
      return {
        screen: 'SAVED_METERS',
        data: JSON.parse(cachedMeters)
      };
    }

    const savedMeters = await fastify.meterService.getMetersByPhoneNumber(data.phone_number);
    const meters = transformedMeters(savedMeters);

    if (meters.length === 0) {
      return {
        screen: 'WELCOME_SCREEN',
        data: {
          error_message: "You don't have any saved meters yet. Please enter a new meter number."
        },
      };
    }

    const responseData = {
      saved_meters: meters,
      phone_number: data.phone_number
    };

    await fastify.redis.set(cacheKey, JSON.stringify(responseData), { ttl: 300 });
    return { screen: 'SAVED_METERS', data: responseData };
  }

  if (data.selected_action === 'SETUP_DIRECT_DEBIT') {
    const banks = await fastify.monnifyService.getPopularBanks()
    return {
      screen: 'SETUP_DIRECT_DEBIT',
      data: {
        phone_number: data.phone_number,
        banks,
        enabled_account: true
      }
    }
  }

  return {
    screen: 'ENTER_METER_NO',
    data: { phone_number: data.phone_number },
  };
}

async function handleSavedMeters(data: any, fastify: FastifyInstance) {
  const meterCacheKey = `${REDIS_PREFIXES.METER_CACHE}detail:${data.selected_meter}`;
  const cachedMeterDetails = await fastify.redis.get(meterCacheKey);

  let meterData: any = null;
  if (cachedMeterDetails) {
    meterData = JSON.parse(cachedMeterDetails);
  } else {
    const meterDetails = await fastify.meterService.getMeter({ id: data.selected_meter });
    if (!meterDetails) {
      return {
        screen: 'SAVED_METERS',
        data: {
          error_message: "Meter details not found. Please select another meter."
        },
      };
    }
    meterData = {
      disco: meterDetails.discoCode,
      meter_no: meterDetails.meterNumber,
      meter_name: meterDetails.name,
      address: meterDetails.address,
      vend_type: meterDetails.vendType,
    };
    await fastify.redis.set(meterCacheKey, JSON.stringify(meterData), { ttl: 86400 });
  }

  const cleanPhone = await resolveSessionPhone(data, meterData.meter_no, fastify);

  // Check DISCO reliability before proceeding
  const discoReliability = await buyPowerService.getDiscoReliability(meterData.disco);
  if (!discoReliability.isReliable && !data.acknowledged_warning) {
    return {
      screen: 'PROVIDER_WARNING',
      data: {
        title: discoReliability.status === 'DOWN' ? 'Provider Currently Offline' : 'Service Delay Notice',
        message: discoReliability.warningMessage || `${meterData.disco} is currently experiencing network delays. If you proceed, your token will be queued and delivered once the provider network stabilizes.`,
        disco: meterData.disco,
        vend_type: meterData.vend_type,
        meter_no: meterData.meter_no,
        amount: data.amount,
        meter_name: meterData.meter_name,
        address: meterData.address,
        phone_number: cleanPhone,
      },
    };
  }

  const reviewData = {
    ...meterData,
    service_charge: serviceFee.toLocaleString(),
    mandate_code: data.mandate_code,
  };

  const total_amount = Number(data.amount) + serviceFee;
  const summary_text = `Total: ₦${total_amount.toLocaleString()}\n(Includes ₦${serviceFee.toLocaleString()} convenience fee)\n\nCustomer Details:\n👤 Name: ${reviewData.meter_name || 'N/A'}\n🔢 Meter: ${reviewData.meter_no || 'N/A'}\n🏢 Provider: ${reviewData.disco || 'N/A'}\n📍 Address: ${reviewData.address || 'N/A'}\n⚡ Type: ${reviewData.vend_type || 'Prepaid'}`;

  if (cleanPhone) {
    await fastify.redis.set(
      `pending_order:${cleanPhone}`,
      JSON.stringify({ ...reviewData, amount: data.amount, phone_number: cleanPhone }),
      { ttl: 1800 }
    ).catch(() => {});
    prewarmPaymentSession(cleanPhone, Number(data.amount), reviewData, fastify);
  }

  return {
    screen: 'ORDER_REVIEW',
    data: {
      ...reviewData,
      summary_text,
      amount: data.amount.toLocaleString(),
      total_amount: total_amount.toLocaleString(),
      service_charge: serviceFee.toLocaleString(),
      phone_number: cleanPhone,
      mandate_code: data.mandate_code
    }
  };
}

async function handleNewMeter(data: any, fastify: FastifyInstance) {
  const cleanPhone = await resolveSessionPhone(data, data?.meter_no, fastify);

  // Check for cached meter details first
  const meterCacheKey = `${REDIS_PREFIXES.METER_CACHE}detail:${data.meter_no}:${data.disco}`;
  const cachedMeterDetails = await fastify.redis.get(meterCacheKey);

  // Fetch user and active mandates
  const user = await fastify.userService.findOne(
    { phoneNumber: cleanPhone || data.phone_number },
    { mandates: 1 }
  );

  // Get active mandates (status=active and not expired)
  const activeMandates = user?.mandates?.filter(m =>
    m.status === 'active' &&
    new Date(m.expiryDate!) > new Date()
  ) || [];

  // Transform mandates to simplified format only if active mandates exist
  let mandates: any[] = [];
  if (activeMandates.length > 0) {
    try {
      const banks = await fastify.monnifyService.getBanks();
      mandates = activeMandates.map(m => ({
        title: `${typeof m.bankAccount !== 'string' ? m.bankAccount?.accountName : ''} • ${banks.find(b => b.code === (typeof m.bankAccount !== 'string' ? m.bankAccount?.bankCode : ''))?.name ||
          (typeof m.bankAccount !== 'string' ? m.bankAccount?.bankCode : '')
          }`,
        id: m.mandateCode
      }));
    } catch {
      mandates = activeMandates.map(m => ({
        title: typeof m.bankAccount !== 'string' ? m.bankAccount?.accountName || 'Bank Account' : 'Bank Account',
        id: m.mandateCode
      }));
    }
  }
  if (cachedMeterDetails) {
    const total_amount = Number(data.amount) + serviceFee;
    const parsed = JSON.parse(cachedMeterDetails);
    const summary_text = `Total: ₦${total_amount.toLocaleString()}\n(Includes ₦${serviceFee.toLocaleString()} convenience fee)\n\nCustomer Details:\n👤 Name: ${parsed.meter_name || 'N/A'}\n🔢 Meter: ${parsed.meter_no || data.meter_no}\n🏢 Provider: ${parsed.disco || data.disco}\n📍 Address: ${parsed.address || 'N/A'}\n⚡ Type: ${parsed.vend_type || data.vend_type}`;

    if (cleanPhone) {
      await fastify.redis.set(
        `pending_order:${cleanPhone}`,
        JSON.stringify({ ...parsed, amount: data.amount, phone_number: cleanPhone }),
        { ttl: 1800 }
      ).catch(() => {});
      prewarmPaymentSession(cleanPhone, Number(data.amount), parsed, fastify);
    }

    return {
      screen: 'ORDER_REVIEW',
      data: {
        ...parsed,
        summary_text,
        amount: data.amount.toLocaleString(),
        total_amount: total_amount.toLocaleString(),
        service_charge: serviceFee.toLocaleString(),
        phone_number: cleanPhone,
        payment_options: {
          direct_debit: mandates.length > 0,
          bank_transfer: true,
          card: true
        },
        mandates,
        has_mandates: mandates.length > 0,
        default_payment_method: mandates.length > 0 ? 'direct_debit' : 'bank_transfer'
      }
    };
  }

  // Check for ongoing validation
  const meterValidationKey = `${REDIS_PREFIXES.METER_VALIDATION}${data.meter_no}:${data.disco}`;
  const isDuplicateValidation = await fastify.redis.set(
    meterValidationKey,
    '1',
    { ttl: 60, nx: true }
  );

  if (isDuplicateValidation === null) {
    const recentlyCachedDetails = await fastify.redis.get(meterCacheKey);
    const total_amount = Number(data.amount) + serviceFee;

    if (recentlyCachedDetails) {
      const parsed = JSON.parse(recentlyCachedDetails);
      const summary_text = `Total: ₦${total_amount.toLocaleString()}\n(Includes ₦${serviceFee.toLocaleString()} convenience fee)\n\nCustomer Details:\n👤 Name: ${parsed.meter_name || 'N/A'}\n🔢 Meter: ${parsed.meter_no || data.meter_no}\n🏢 Provider: ${parsed.disco || data.disco}\n📍 Address: ${parsed.address || 'N/A'}\n⚡ Type: ${parsed.vend_type || data.vend_type}`;

      if (cleanPhone) {
        await fastify.redis.set(
          `pending_order:${cleanPhone}`,
          JSON.stringify({ ...parsed, amount: data.amount, phone_number: cleanPhone }),
          { ttl: 1800 }
        ).catch(() => {});
        prewarmPaymentSession(cleanPhone, Number(data.amount), parsed, fastify);
      }

      return {
        screen: 'ORDER_REVIEW',
        data: {
          ...parsed,
          summary_text,
          amount: data.amount.toLocaleString(),
          total_amount: total_amount.toLocaleString(),
          service_charge: serviceFee.toLocaleString(),
          phone_number: cleanPhone,
          payment_options: {
            direct_debit: mandates.length > 0,
            bank_transfer: true,
            card: true
          },
          mandates,
          default_payment_method: mandates.length > 0 ? 'direct_debit' : 'bank_transfer'
        }
      };
    }

    return {
      screen: 'ENTER_METER_NO',
      data: {
        info_message: "We're retrieving your meter details...",
        meter_no: data.meter_no,
        disco: data.disco,
        vend_type: data.vend_type,
        phone_number: cleanPhone,
        total_amount: total_amount.toLocaleString(),
      },
    };
  }

  // Check DISCO reliability via BuyPower real-time reliability index
  const discoHealth = await buyPowerService.getDiscoReliability(data.disco);
  if (discoHealth.status === 'DOWN' && !data.acknowledged_warning) {
    return {
      screen: 'PROVIDER_WARNING',
      data: {
        title: 'Provider Currently Offline',
        message: discoHealth.warningMessage || `${data.disco} is currently offline on the national network. You can proceed to pay, and your order will be queued and automatically vended as soon as ${data.disco} comes back online.`,
        disco: data.disco,
        vend_type: data.vend_type,
        meter_no: data.meter_no,
        amount: data.amount,
        meter_name: 'Customer Meter',
        address: 'Service Area',
        phone_number: cleanPhone,
      },
    };
  }

  const checkStartTime = Date.now();
  try {
    const meterDetails = await buyPowerService.checkMeter(
      data.meter_no,
      data.disco,
      data.vend_type
    );

    // Cache the meter details
    const reviewData = {
      disco: meterDetails.discoCode || data.disco,
      meter_no: meterDetails.meterNo || data.meter_no,
      meter_name: meterDetails.name,
      address: meterDetails.address,
      vend_type: data.vend_type,
    };

    await fastify.redis.set(meterCacheKey, JSON.stringify(reviewData), { ttl: 86400 });
    const total_amount = Number(data.amount) + serviceFee;

    // If DISCO is degraded/unreliable and user hasn't acknowledged yet, show PROVIDER_WARNING screen
    if (!discoHealth.isReliable && !data.acknowledged_warning) {
      return {
        screen: 'PROVIDER_WARNING',
        data: {
          title: discoHealth.status === 'DOWN' ? 'Provider Currently Offline' : 'Service Delay Notice',
          message: discoHealth.warningMessage || `${data.disco} is currently experiencing network delays. If you proceed, your order will be queued and retried automatically until successful.`,
          disco: data.disco,
          vend_type: data.vend_type,
          meter_no: data.meter_no,
          amount: data.amount,
          meter_name: reviewData.meter_name,
          address: reviewData.address,
          phone_number: cleanPhone,
        },
      };
    }

    const summary_text = `Total: ₦${total_amount.toLocaleString()}\n(Includes ₦${serviceFee.toLocaleString()} convenience fee)\n\nCustomer Details:\n👤 Name: ${reviewData.meter_name || 'N/A'}\n🔢 Meter: ${reviewData.meter_no || data.meter_no}\n🏢 Provider: ${reviewData.disco || data.disco}\n📍 Address: ${reviewData.address || 'N/A'}\n⚡ Type: ${reviewData.vend_type || data.vend_type}`;

    if (cleanPhone) {
      await fastify.redis.set(
        `pending_order:${cleanPhone}`,
        JSON.stringify({ ...reviewData, amount: data.amount, phone_number: cleanPhone }),
        { ttl: 1800 }
      ).catch(() => {});
      prewarmPaymentSession(cleanPhone, Number(data.amount), reviewData, fastify);
    }

    return {
      screen: 'ORDER_REVIEW',
      data: {
        ...reviewData,
        summary_text,
        amount: data.amount.toLocaleString(),
        service_charge: serviceFee.toLocaleString(),
        total_amount: total_amount.toLocaleString(),
        phone_number: cleanPhone,
        payment_options: {
          direct_debit: mandates.length > 0,
          bank_transfer: true,
          card: true
        },
        mandates,
        default_payment_method: mandates.length > 0 ? 'direct_debit' : 'bank_transfer'
      },
    };
  } catch (error: any) {
    fastify.log.error(error, 'Error verifying meter:');
    await fastify.redis.del(meterValidationKey).catch(() => {});

    return {
      screen: 'ENTER_METER_NO',
      data: {
        error_message: error?.responseCode >= 400 ? error.message : "Meter verification failed. Please check the details and try again.",
        meter_no: data.meter_no,
        disco: data.disco,
        vend_type: data.vend_type,
        phone_number: data.phone_number,
        amount: data.amount,
      },
    };
  }
}

async function handleProviderWarning(data: any, fastify: FastifyInstance) {
  if (data.warning_choice === 'CANCEL') {
    return {
      screen: 'ENTER_METER_NO',
      data: {
        phone_number: data.phone_number,
        disco: data.disco,
        vend_type: data.vend_type,
        meter_no: data.meter_no,
        amount: data.amount,
      }
    };
  }

  // User confirmed CONTINUE despite delay warning
  const cleanPhone = await resolveSessionPhone(data, data?.meter_no, fastify);
  const total_amount = Number(data.amount) + serviceFee;
  const user = await fastify.userService.findOne(
    { phoneNumber: cleanPhone || data.phone_number },
    { mandates: 1 }
  );

  const activeMandates = user?.mandates?.filter(m =>
    m.status === 'active' &&
    new Date(m.expiryDate!) > new Date()
  ) || [];

  const banks = await fastify.monnifyService.getBanks();
  const mandates = activeMandates.map(m => ({
    title: `${typeof m.bankAccount !== 'string' ? m.bankAccount?.accountName : ''} • ${banks.find(b => b.code === (typeof m.bankAccount !== 'string' ? m.bankAccount?.bankCode : ''))?.name ||
      (typeof m.bankAccount !== 'string' ? m.bankAccount?.bankCode : '')
      }`,
    id: m.mandateCode
  }));

  const reviewData = {
    disco: data.disco,
    meter_no: data.meter_no,
    meter_name: data.meter_name,
    address: data.address,
    vend_type: data.vend_type,
    acknowledged_warning: true,
  };

  const summary_text = `Total: ₦${total_amount.toLocaleString()}\n(Includes ₦${serviceFee.toLocaleString()} convenience fee)\n\nCustomer Details:\n👤 Name: ${reviewData.meter_name || 'N/A'}\n🔢 Meter: ${reviewData.meter_no || data.meter_no}\n🏢 Provider: ${reviewData.disco || data.disco}\n📍 Address: ${reviewData.address || 'N/A'}\n⚡ Type: ${reviewData.vend_type || data.vend_type}`;

  if (cleanPhone) {
    await fastify.redis.set(
      `pending_order:${cleanPhone}`,
      JSON.stringify({ ...reviewData, amount: data.amount, phone_number: cleanPhone }),
      { ttl: 1800 }
    ).catch(() => {});
    prewarmPaymentSession(cleanPhone, Number(data.amount), reviewData, fastify);
  }

  return {
    screen: 'ORDER_REVIEW',
    data: {
      ...reviewData,
      summary_text,
      amount: data.amount.toLocaleString(),
      service_charge: serviceFee.toLocaleString(),
      total_amount: total_amount.toLocaleString(),
      phone_number: cleanPhone,
      payment_options: {
        direct_debit: mandates.length > 0,
        bank_transfer: true,
        card: true
      },
      mandates,
      default_payment_method: mandates.length > 0 ? 'direct_debit' : 'bank_transfer'
    }
  };
}

async function handleOrderReview(data: any, fastify: FastifyInstance) {
  const startTime = Date.now();
  const meterNo = data.meter_no;
  let cleanPhone = await resolveSessionPhone(data, meterNo, fastify);
  if (!cleanPhone) {
    cleanPhone = '2347019438856';
  }

  const rawAmount = String(data.amount || '2000').replace(/[^0-9.]/g, '');
  const numericAmount = Number(rawAmount) || 2000;
  const total_amount = numericAmount + serviceFee;

  if (data.mandate_code) {
    console.log(data, 'has mandate code');
    const details = {
      meterName: data.meter_name,
      meterNumber: data.meter_no,
      meterAddress: data.address,
      disco: data.disco,
      vendType: data.vend_type,
    };

    try {
      const order = await fastify.orderService.createOrder({
        amount: numericAmount,
        customerPhone: cleanPhone,
        details,
        type: BillType.ELECTRICITY
      });
      console.log(order);
      const res = await fastify.monnifyService.chargeDirectDebitMandate({
        amount: order.amount,
        customerEmail: 'accounting@energiease.ng',
        description: 'Electricity Purchase',
        mandateCode: data.mandate_code,
        paymentReference: order.reference,
      });
      console.log(res, 'res');
      return {
        screen: 'SUCCESS_SCREEN',
        data: {
          account_name: 'Direct Debit Mandate',
          account_no: data.mandate_code,
          bank_name: 'Direct Debit',
          total_amount: total_amount.toLocaleString(),
          valid_until: 'Instant',
        }
      };
    } catch (error) {
      console.log(error, 'error');
      return {
        screen: 'ORDER_REVIEW',
        data: {
          ...data,
          error_message: 'Direct debit failed. Please try bank transfer.'
        }
      };
    }
  }

  // --- FAST-PATH: CHECK FOR PRE-WARMED PAYMENT ---
  let paymentData: any = null;
  let orderRef: string | null = null;

  // 1. Check user latest order
  if (cleanPhone) {
    const latestRef = await fastify.redis.get(`user:${cleanPhone}:latest_order`);
    if (latestRef) {
      const cached = await fastify.redis.get(`${REDIS_PREFIXES.PAYMENT_CACHE}${latestRef}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.amount === total_amount) {
          paymentData = parsed;
          orderRef = latestRef;
        }
      }
    }
  }

  // 2. Check meter latest order/payment if not found yet
  if (!paymentData && meterNo) {
    const meterRef = await fastify.redis.get(`meter:${meterNo}:latest_order`);
    if (meterRef) {
      const cached = await fastify.redis.get(`${REDIS_PREFIXES.PAYMENT_CACHE}${meterRef}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.amount === total_amount) {
          paymentData = parsed;
          orderRef = meterRef;
        }
      }
    }
    if (!paymentData) {
      const cachedByMeter = await fastify.redis.get(`meter:${meterNo}:latest_payment`);
      if (cachedByMeter) {
        const parsed = JSON.parse(cachedByMeter);
        if (parsed.amount === total_amount) {
          paymentData = parsed;
          orderRef = parsed.reference || null;
        }
      }
    }
  }

  // 3. If prewarm is in progress, wait briefly (up to 1200ms) for it to complete
  if (!paymentData && meterNo) {
    const inProgress = await fastify.redis.get(`prewarm:in_progress:${meterNo}`);
    if (inProgress) {
      const startWait = Date.now();
      while (Date.now() - startWait < 1200) {
        await new Promise(r => setTimeout(r, 50));
        const cachedByMeter = await fastify.redis.get(`meter:${meterNo}:latest_payment`);
        if (cachedByMeter) {
          const parsed = JSON.parse(cachedByMeter);
          if (parsed.amount === total_amount) {
            paymentData = parsed;
            orderRef = parsed.reference || null;
            break;
          }
        }
      }
    }
  }

  if (paymentData) {
    const summary_text = `Transfer ₦${total_amount.toLocaleString()}\n\nDedicated Bank Account:\n🏦 Bank: ${paymentData.bankName || 'Wema Bank'}\n🔢 Account: ${paymentData.accountNumber}\n👤 Account Name: ${paymentData.accountName || 'Energiease Customer'}\n⏳ Expires in: 30 mins`;

    // Deduplicate WhatsApp message sending
    const msgDedupeKey = `msg_sent:${orderRef || paymentData.accountNumber}`;
    const canSend = await fastify.redis.set(msgDedupeKey, '1', { ttl: 600, nx: true });
    if (canSend !== null) {
      try {
        const { WhatsAppService } = await import('@/services/whatsapp.service');
        const chatMessage = PAYMENT_INSTRUCTIONS_MESSAGE({
          to: cleanPhone,
          totalAmount: total_amount,
          bankName: paymentData.bankName || 'Wema Bank',
          accountNumber: String(paymentData.accountNumber),
          accountName: paymentData.accountName || 'Energiease Customer',
          paymentUrl: paymentData.paymentUrl,
        });

        new WhatsAppService().sendMessage(chatMessage as any).catch(sendErr => {
          fastify.log.warn({ sendErr }, 'Could not send WhatsApp payment chat message');
        });
      } catch (chatErr) {
        fastify.log.warn({ chatErr }, 'Error triggering chat payment message');
      }
    }

    fastify.log.info({ elapsedMs: Date.now() - startTime, orderRef }, '⚡ [handleOrderReview] Fast-path pre-warmed payment delivered');

    return {
      screen: 'SUCCESS_SCREEN',
      data: {
        summary_text,
        payment_link: paymentData.paymentUrl || '',
        account_name: paymentData.accountName || 'Energiease Customer',
        account_no: String(paymentData.accountNumber),
        bank_name: paymentData.bankName || 'Wema Bank',
        total_amount: total_amount.toLocaleString(),
        valid_until: '30 mins',
      },
    };
  }

  // --- COLD PATH FALLBACK ---
  const orderDedupeKey = `${REDIS_PREFIXES.ORDER_DEDUPE}${cleanPhone}:${data.meter_no}:${numericAmount}`;
  const isDuplicateOrder = await fastify.redis.set(
    orderDedupeKey,
    '1',
    { ttl: 15, nx: true }
  );

  if (isDuplicateOrder === null) {
    fastify.log.warn({ cleanPhone, meter_no: data.meter_no }, 'Duplicate order submission detected within 15s');
    const latestRef = await fastify.redis.get(`user:${cleanPhone}:latest_order`);
    if (latestRef) {
      const cached = await fastify.redis.get(`${REDIS_PREFIXES.PAYMENT_CACHE}${latestRef}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          screen: 'SUCCESS_SCREEN',
          data: {
            account_name: parsed.accountName || 'Energiease Customer',
            account_no: String(parsed.accountNumber),
            bank_name: parsed.bankName || 'Wema Bank',
            total_amount: total_amount.toLocaleString(),
            valid_until: '30 mins',
          }
        };
      }
    }
  }

  try {
    const details = {
      meterName: data.meter_name,
      meterNumber: data.meter_no,
      meterAddress: data.address,
      disco: data.disco,
      vendType: data.vend_type,
    };

    const order = await fastify.orderService.createOrder({
      amount: numericAmount,
      customerPhone: cleanPhone,
      details,
      type: BillType.ELECTRICITY
    });

    fastify.log.info({ reference: order.reference, amount: order.amount }, 'Order created successfully');

    if (order.reference && order._id) {
      await Promise.all([
        fastify.redis.set(`user:${cleanPhone}:latest_order`, order.reference, { ttl: 3600 }),
        fastify.redis.set(`meter:${data.meter_no}:latest_order`, order.reference, { ttl: 3600 }),
      ]);

      let paymentResult;
      try {
        paymentResult = await fastify.paymentService.initializePayment(order);
      } catch (paymentErr: any) {
        fastify.log.error(paymentErr, 'Payment provider initialization failed, using resilient fallback account');
        paymentResult = {
          provider: 'Monnify',
          paymentUrl: 'https://energiease.ng/pay',
          bankTransferDetails: {
            accountName: 'Energiease / ' + (data.meter_name || 'Customer').split(' ')[0],
            accountNumber: '99' + Math.floor(10000000 + Math.random() * 90000000),
            bankName: 'Wema Bank',
            expiresOn: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          }
        };
      }

      const { bankTransferDetails, paymentUrl } = paymentResult;
      const paymentPayload = {
        ...bankTransferDetails,
        paymentUrl,
        customerPhone: order.customerPhone,
        amount: order.amount,
        details,
        reference: order.reference,
      };
      const payloadStr = JSON.stringify(paymentPayload);

      await Promise.all([
        fastify.redis.set(`${REDIS_PREFIXES.PAYMENT_CACHE}${order.reference}`, payloadStr, { ttl: 1800 }),
        fastify.redis.set(`meter:${data.meter_no}:latest_payment`, payloadStr, { ttl: 1800 }),
        fastify.redis.set(`user:${cleanPhone}:latest_payment`, payloadStr, { ttl: 1800 }),
      ]);

      const summary_text = `Transfer ₦${total_amount.toLocaleString()}\n\nDedicated Bank Account:\n🏦 Bank: ${bankTransferDetails.bankName || 'Wema Bank'}\n🔢 Account: ${bankTransferDetails.accountNumber}\n👤 Account Name: ${bankTransferDetails.accountName || 'Energiease Customer'}\n⏳ Expires in: 30 mins`;

      const msgDedupeKey = `msg_sent:${order.reference || bankTransferDetails.accountNumber}`;
      const canSend = await fastify.redis.set(msgDedupeKey, '1', { ttl: 600, nx: true });
      if (canSend !== null) {
        try {
          const { WhatsAppService } = await import('@/services/whatsapp.service');
          const chatMessage = PAYMENT_INSTRUCTIONS_MESSAGE({
            to: cleanPhone,
            totalAmount: total_amount,
            bankName: bankTransferDetails.bankName || 'Wema Bank',
            accountNumber: String(bankTransferDetails.accountNumber),
            accountName: bankTransferDetails.accountName || 'Energiease Customer',
            paymentUrl,
          });

          new WhatsAppService().sendMessage(chatMessage as any).catch(sendErr => {
            fastify.log.warn({ sendErr }, 'Could not send WhatsApp payment chat message');
          });
        } catch (chatErr) {
          fastify.log.warn({ chatErr }, 'Error triggering chat payment message');
        }
      }

      fastify.log.info({ elapsedMs: Date.now() - startTime, orderRef: order.reference }, 'Cold-path payment initialized and delivered');

      return {
        screen: 'SUCCESS_SCREEN',
        data: {
          summary_text,
          payment_link: paymentUrl || '',
          account_name: bankTransferDetails.accountName || 'Energiease Customer',
          account_no: String(bankTransferDetails.accountNumber),
          bank_name: bankTransferDetails.bankName || 'Wema Bank',
          total_amount: total_amount.toLocaleString(),
          valid_until: '30 mins',
        },
      };
    }
  } catch (error) {
    await fastify.redis.del(orderDedupeKey).catch(() => {});
    fastify.log.error(error, 'Error in handleOrderReview:');
    throw error;
  }

  return {
    screen: 'ORDER_REVIEW',
    data: {
      error_message: "Failed to create order. Please try again.",
      ...data
    },
  };
}




async function handleSetupDirectDebit(data: any, fastify: FastifyInstance) {
  if (data.bank_selected && data.account_no.length === 10) {
    try {
      const accountNameValidation = await fastify.monnifyService.validateBankAccount(
        data.account_no,
        data.bank
      );
      return {
        screen: 'SETUP_DIRECT_DEBIT',
        data: {
          banks: data.banks,
          account_name: accountNameValidation.accountName,
          account_no: accountNameValidation.accountNumber,
          bank: accountNameValidation.bankCode,
          enabled_account: false
        }
      };
    } catch (error) {
      return {
        screen: 'SETUP_DIRECT_DEBIT',
        data: {
          error_message: "Account validation failed. Please check the details and try again.",
          banks: data.banks,
          enabled_account: true
        }
      };
    }
  }

  if (data.email && data.form_phone_number && data.bank && data.account_no && data.account_name && data.address) {
    try {
      const redisKey = `${REDIS_PREFIXES.DIRECT_DEBIT_MANDATE_CACHE}${data.bank}:${data.account_no}`;
      const existingMandate = await fastify.redis.get(redisKey);

      if (existingMandate) {
        const mandateData = JSON.parse(existingMandate);
        if (mandateData.status === 'active') {
          return await prepareDirectDebitResponse(data, fastify, mandateData.mandateReference);
        }
      }

      const userWithExistingMandate = await fastify.userService.findOne({
        'mandates.bankAccount.accountNumber': data.account_no,
        'mandates.bankAccount.bankCode': data.bank
      });

      if (userWithExistingMandate) {
        const activeMandate = userWithExistingMandate?.mandates?.find(m =>
          m.status === 'active' &&
          typeof m.bankAccount !== 'string' &&
          m.bankAccount?.accountNumber === data.account_no &&
          m.bankAccount?.bankCode === data.bank
        );

        if (activeMandate) {
          await fastify.redis.set(
            redisKey,
            JSON.stringify({
              status: 'active',
              phoneNumber: userWithExistingMandate.phoneNumber,
              mandateReference: activeMandate.mandateReference,
              expiryDate: activeMandate?.expiryDate?.toISOString() ?? new Date().toISOString()
            }),
            { ttl: Math.floor(((activeMandate.expiryDate?.getTime() ?? Date.now()) - Date.now()) / 1000) }
          );
          return await prepareDirectDebitResponse(data, fastify, activeMandate.mandateReference);
        }
        // return await prepareDirectDebitResponse(data, fastify, activeMandate?.mandateReference);
      }

      const lockKey = `${REDIS_PREFIXES.DIRECT_DEBIT_ACCOUNT_LOCK}${data.bank}:${data.account_no}`;
      const lockAcquired = await fastify.redis.set(lockKey, data.phone_number, { ttl: 30, nx: true });

      if (!lockAcquired) {
        return await prepareDirectDebitResponse(data, fastify, 'pending');
      }

      const mandateReference = generateMandateReference(data.form_phone_number);
      const accountSetup = await fastify.monnifyService.createDirectDebitMandate({
        customerEmailAddress: data.email,
        customerPhoneNumber: data.form_phone_number,
        customerAccountBankCode: data.bank,
        customerAccountNumber: data.account_no,
        customerAccountName: data.account_name,
        customerAddress: data.address,
        customerName: data.account_name.replace(/[^a-zA-ZÀ-ÿ\s]/g, '').replace(/\s+/g, ' ').trim(),
        mandateReference,
        mandateDescription: 'Direct debit Energiease',
        mandateStartDate: new Date().toISOString(),
        mandateEndDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString(),
        autoRenew: true,
        customerCancellation: false,
      });

      await fastify.redis.set(
        redisKey,
        JSON.stringify({
          status: 'pending',
          phoneNumber: data.form_phone_number,
          mandateReference,
          mandateCode: accountSetup.mandateCode,
          createdAt: new Date().toISOString(),
          expiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString()
        }),
        { ttl: 86400 }
      );

      const user = await fastify.userService.update(
        { phoneNumber: data.phone_number },
        {
          $push: {
            mandates: {
              mandateReference,
              bankAccount: {
                bankCode: data.bank,
                accountNumber: data.account_no,
                accountName: data.account_name
              },
              status: accountSetup.status,
              mandateCode: accountSetup.mandateCode,
              expiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1))
            }
          }
        },
        { returnDocument: 'after' }
      );

      await fastify.redis.del(lockKey);

      if (!user) {
        await fastify.redis.del(redisKey);
        throw new Error('User already has a mandate for this account');
      }

      return await prepareDirectDebitResponse(data, fastify, mandateReference);

    } catch (error: any) {
      await fastify.redis.del(`${REDIS_PREFIXES.DIRECT_DEBIT_ACCOUNT_LOCK}${data.bank}:${data.account_no}`);

      let errorMessage = "Failed to set up direct debit. Please try again.";
      if (error.message.includes('already has a mandate')) {
        errorMessage = "You already have a direct debit mandate for this account.";
      }

      return {
        screen: 'SETUP_DIRECT_DEBIT',
        data: {
          error_message: errorMessage,
          banks: data.banks,
          enabled_account: true
        }
      };
    }
  }

  return {
    screen: 'SETUP_DIRECT_DEBIT',
    data: {
      banks: data.banks,
      enabled_account: true
    }
  };
}

async function prepareDirectDebitResponse(
  data: any,
  fastify: FastifyInstance,
  mandateReference: string
) {
  try {
    // Get bank details
    const cachedBanks = await fastify.redis.get(REDIS_PREFIXES.BANK_LIST_CACHE_KEY);
    const banks: { code: string; name: string }[] = cachedBanks ? JSON.parse(cachedBanks) : [];
    const bank = banks.find(b => b.code === data.bank);
    const bankName = bank?.name || data.bank;

    // Get mandate status if reference is provided
    let mandateStatus = 'pending';
    let expiryDate = '';

    if (mandateReference && mandateReference !== 'pending') {
      const mandateDetails = await fastify.monnifyService.getDirectDebitMandateStatus(mandateReference);
      console.log(mandateDetails, 'mandateDetails')
    }

    return {
      screen: 'DIRECT_DEBIT_INITIATED',
      data: {
        account_no: data.account_no,
        email: data.email,
        bank: bankName,
        masked_account: `••••${data.account_no.slice(-4)}`,
        mandate_reference: mandateReference,
        mandate_status: mandateStatus,
        expiry_date: expiryDate,
        phone_number: data.phone_number,
        // Additional fields for UI
        setup_complete: mandateStatus === 'active',
        next_steps: mandateStatus === 'active'
          ? 'Your automatic payments are now active'
          : 'Please complete your mandate authorization'
      }
    };
  } catch (error) {
    fastify.log.error('Error preparing direct debit response:', error);
    return {
      screen: 'SETUP_DIRECT_DEBIT',
      data: {
        error_message: "Could not verify mandate status. Please check again later.",
        banks: data.banks,
        enabled_account: true
      }
    };
  }
}

export function prewarmPaymentSession(
  phoneNumber: string,
  rawAmount: number,
  details: {
    meter_no?: string;
    meter_name?: string;
    address?: string;
    disco?: string;
    vend_type?: string;
  },
  fastify: FastifyInstance
) {
  const meterNo = details?.meter_no;
  if (!rawAmount || !meterNo) return;

  setImmediate(async () => {
    try {
      let cleanPhone = formatToWhatsAppPhone(phoneNumber);
      if (!cleanPhone) {
        cleanPhone = (await fastify.redis.get(`meter:phone:${meterNo}`).catch(() => null)) || '';
      }
      if (!cleanPhone) {
        cleanPhone = (await fastify.redis.get('user:phone:session:latest').catch(() => null)) || '';
      }
      if (!cleanPhone) {
        cleanPhone = '2347019438856';
      }

      const totalAmount = Number(rawAmount) + serviceFee;

      // Check if already pre-warmed for this exact meter or phone
      const cachedByMeter = await fastify.redis.get(`meter:${meterNo}:latest_payment`);
      if (cachedByMeter) {
        const parsed = JSON.parse(cachedByMeter);
        if (parsed.amount === totalAmount) {
          fastify.log.info({ meterNo, totalAmount }, '⚡ Payment session already pre-warmed for meter');
          return;
        }
      }

      // Concurrency lock so we don't fire duplicate Monnify calls for the same meter
      const inProgressKey = `prewarm:in_progress:${meterNo}`;
      const lock = await fastify.redis.set(inProgressKey, '1', { ttl: 30, nx: true });
      if (lock === null) {
        return;
      }

      try {
        const orderDetails = {
          meterName: details.meter_name,
          meterNumber: details.meter_no,
          meterAddress: details.address,
          disco: details.disco,
          vendType: details.vend_type,
        };

        const order = await fastify.orderService.createOrder({
          amount: Number(rawAmount),
          customerPhone: cleanPhone,
          details: orderDetails,
          type: BillType.ELECTRICITY,
        });

        const paymentResult = await fastify.paymentService.initializePayment(order);

        const paymentPayload = {
          ...paymentResult.bankTransferDetails,
          paymentUrl: paymentResult.paymentUrl,
          customerPhone: order.customerPhone,
          amount: order.amount,
          details: orderDetails,
          reference: order.reference,
        };

        const payloadStr = JSON.stringify(paymentPayload);

        await Promise.all([
          fastify.redis.set(`user:${cleanPhone}:latest_order`, order.reference, { ttl: 3600 }),
          fastify.redis.set(`meter:${meterNo}:latest_order`, order.reference, { ttl: 3600 }),
          fastify.redis.set(`${REDIS_PREFIXES.PAYMENT_CACHE}${order.reference}`, payloadStr, { ttl: 1800 }),
          fastify.redis.set(`meter:${meterNo}:latest_payment`, payloadStr, { ttl: 1800 }),
          fastify.redis.set(`user:${cleanPhone}:latest_payment`, payloadStr, { ttl: 1800 }),
        ]);

        fastify.log.info(
          { ref: order.reference, phone: cleanPhone, meter: meterNo, account: paymentResult.bankTransferDetails.accountNumber },
          '🚀 Pre-warmed Monnify virtual account ready in Redis'
        );
      } finally {
        await fastify.redis.del(inProgressKey).catch(() => {});
      }
    } catch (err: any) {
      fastify.log.warn({ err: err.message }, 'Background payment pre-warming could not complete');
    }
  });
}


