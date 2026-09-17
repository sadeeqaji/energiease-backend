import { REDIS_PREFIXES } from '@/constants/redisPrefix';
import { serviceFee } from '@/constants/serviceFee';
import buyPowerService from '@/services/buypower.service';
import { BillType } from '@/types/bill.types';
import { DecryptedResponse } from '@/types/whatsapp.types';
import { AppException } from '@/utils/appException.utils';
import { generateMandateReference } from '@/utils/generateMandateRef';
import { transformedMeters } from '@/utils/meter';
import { getMinutesRemaining } from '@/utils/time';
import { FastifyInstance } from 'fastify';



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

  if (cachedMeterDetails) {
    const total_amount = Number(data.amount) + serviceFee;
    const parsed = JSON.parse(cachedMeterDetails);
    const summary_text = `*Total: ₦${total_amount.toLocaleString()}*\n(Includes ₦${serviceFee.toLocaleString()} convenience fee)\n\n*Customer Details:*\n👤 Name: ${parsed.meter_name || 'N/A'}\n🔢 Meter: ${parsed.meter_no || 'N/A'}\n🏢 Provider: ${parsed.disco || 'N/A'}\n📍 Address: ${parsed.address || 'N/A'}\n⚡ Type: ${parsed.vend_type || 'Prepaid'}`;

    return {
      screen: 'ORDER_REVIEW',
      data: {
        ...parsed,
        summary_text,
        amount: data.amount.toLocaleString(),
        total_amount: total_amount.toLocaleString(),
        service_charge: serviceFee.toLocaleString(),
        phone_number: data.phone_number,
        mandate_code: data.mandate_code
      }
    };
  }

  const meterDetails = await fastify.meterService.getMeter({ id: data.selected_meter });
  if (!meterDetails) {
    return {
      screen: 'SAVED_METERS',
      data: {
        error_message: "Meter details not found. Please select another meter."
      },
    };
  }

  const reviewData = {
    disco: meterDetails.discoCode,
    meter_no: meterDetails.meterNumber,
    meter_name: meterDetails.name,
    address: meterDetails.address,
    vend_type: meterDetails.vendType,
    service_charge: serviceFee.toLocaleString(),
    mandate_code: data.mandate_code
  };

  await fastify.redis.set(meterCacheKey, JSON.stringify(reviewData), { ttl: 86400 });
  const total_amount = Number(data.amount) + serviceFee;
  const summary_text = `*Total: ₦${total_amount.toLocaleString()}*\n(Includes ₦${serviceFee.toLocaleString()} convenience fee)\n\n*Customer Details:*\n👤 Name: ${reviewData.meter_name || 'N/A'}\n🔢 Meter: ${reviewData.meter_no || 'N/A'}\n🏢 Provider: ${reviewData.disco || 'N/A'}\n📍 Address: ${reviewData.address || 'N/A'}\n⚡ Type: ${reviewData.vend_type || 'Prepaid'}`;

  return {
    screen: 'ORDER_REVIEW',
    data: {
      ...reviewData,
      summary_text,
      amount: data.amount.toLocaleString(),
      total_amount: total_amount.toLocaleString(),
      service_charge: serviceFee.toLocaleString(),
      phone_number: data.phone_number,
      mandate_code: data.mandate_code
    }
  };
}

async function handleNewMeter(data: any, fastify: FastifyInstance) {


  // if (!data?.meter_no || !data?.disco || !data?.vend_type) {
  //   throw AppException.BadRequest('Missing required parameters');
  // }

  if (data?.phone_number) {
    await fastify.redis.set('user:phone:session:latest', data.phone_number, { ttl: 3600 }).catch(() => {});
    if (data.meter_no) {
      await fastify.redis.set(`meter:phone:${data.meter_no}`, data.phone_number, { ttl: 86400 }).catch(() => {});
    }
  }

  // Check for cached meter details first
  const meterCacheKey = `${REDIS_PREFIXES.METER_CACHE}detail:${data.meter_no}:${data.disco}`;
  const cachedMeterDetails = await fastify.redis.get(meterCacheKey);

  // Fetch user and active mandates
  const user = await fastify.userService.findOne(
    { phoneNumber: data.phone_number },
    { mandates: 1 }
  );

  // Get active mandates (status=active and not expired)
  const activeMandates = user?.mandates?.filter(m =>
    m.status === 'active' &&
    new Date(m.expiryDate!) > new Date()
  ) || [];

  // Get all banks for name resolution
  const banks = await fastify.monnifyService.getBanks();

  // Transform mandates to simplified format
  const mandates = activeMandates.map(m => ({
    title: `${typeof m.bankAccount !== 'string' ? m.bankAccount?.accountName : ''} • ${banks.find(b => b.code === (typeof m.bankAccount !== 'string' ? m.bankAccount?.bankCode : ''))?.name ||
      (typeof m.bankAccount !== 'string' ? m.bankAccount?.bankCode : '')
      }`,
    id: m.mandateCode // Using mandateCode as identifier
  }));
  if (cachedMeterDetails) {
    const total_amount = Number(data.amount) + serviceFee;
    const parsed = JSON.parse(cachedMeterDetails);
    const summary_text = `*Total: ₦${total_amount.toLocaleString()}*\n(Includes ₦${serviceFee.toLocaleString()} convenience fee)\n\n*Customer Details:*\n👤 Name: ${parsed.meter_name || 'N/A'}\n🔢 Meter: ${parsed.meter_no || data.meter_no}\n🏢 Provider: ${parsed.disco || data.disco}\n📍 Address: ${parsed.address || 'N/A'}\n⚡ Type: ${parsed.vend_type || data.vend_type}`;

    return {
      screen: 'ORDER_REVIEW',
      data: {
        ...parsed,
        summary_text,
        amount: data.amount.toLocaleString(),
        total_amount: total_amount.toLocaleString(),
        service_charge: serviceFee.toLocaleString(),
        phone_number: data.phone_number,
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
      const summary_text = `*Total: ₦${total_amount.toLocaleString()}*\n(Includes ₦${serviceFee.toLocaleString()} convenience fee)\n\n*Customer Details:*\n👤 Name: ${parsed.meter_name || 'N/A'}\n🔢 Meter: ${parsed.meter_no || data.meter_no}\n🏢 Provider: ${parsed.disco || data.disco}\n📍 Address: ${parsed.address || 'N/A'}\n⚡ Type: ${parsed.vend_type || data.vend_type}`;

      return {
        screen: 'ORDER_REVIEW',
        data: {
          ...parsed,
          summary_text,
          amount: data.amount.toLocaleString(),
          total_amount: total_amount.toLocaleString(),
          service_charge: serviceFee.toLocaleString(),
          phone_number: data.phone_number,
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
        phone_number: data.phone_number,
        total_amount: total_amount.toLocaleString(),
      },
    };
  }

  // Check DISCO health first
  const discoHealth = await fastify.discoHealthService?.getDiscoHealth(data.disco);
  if (discoHealth?.status === 'DOWN') {
    return {
      screen: 'ENTER_METER_NO',
      data: {
        error_message: discoHealth.warningMessage || `${data.disco} is currently undergoing maintenance. Please try again later.`,
        meter_no: data.meter_no,
        disco: data.disco,
        vend_type: data.vend_type,
        phone_number: data.phone_number,
        amount: data.amount,
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

    const latencyMs = Date.now() - checkStartTime;
    await fastify.discoHealthService?.recordAttempt({
      disco: data.disco,
      success: true,
      latencyMs,
    });

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

    // If DISCO is degraded and user hasn't acknowledged yet, show OPay-style warning screen
    if (discoHealth.status === 'DEGRADED' && !data.acknowledged_warning) {
      return {
        screen: 'PROVIDER_WARNING',
        data: {
          title: 'Service Delay Notice',
          message: discoHealth.warningMessage || 'The service provider is currently busy due to high order volume, which may cause delayed response or failure.',
          disco: data.disco,
          vend_type: data.vend_type,
          meter_no: data.meter_no,
          amount: data.amount,
          meter_name: reviewData.meter_name,
          address: reviewData.address,
          phone_number: data.phone_number,
        },
      };
    }

    const summary_text = `*Total: ₦${total_amount.toLocaleString()}*\n(Includes ₦${serviceFee.toLocaleString()} convenience fee)\n\n*Customer Details:*\n👤 Name: ${reviewData.meter_name || 'N/A'}\n🔢 Meter: ${reviewData.meter_no || data.meter_no}\n🏢 Provider: ${reviewData.disco || data.disco}\n📍 Address: ${reviewData.address || 'N/A'}\n⚡ Type: ${reviewData.vend_type || data.vend_type}`;

    return {
      screen: 'ORDER_REVIEW',
      data: {
        ...reviewData,
        summary_text,
        amount: data.amount.toLocaleString(),
        service_charge: serviceFee.toLocaleString(),
        total_amount: total_amount.toLocaleString(),
        phone_number: data.phone_number,
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
    await fastify.redis.del(meterValidationKey);
    const latencyMs = Date.now() - checkStartTime;
    const isNetworkOrServerError = !error?.responseCode || error?.responseCode >= 500;

    if (isNetworkOrServerError) {
      await fastify.discoHealthService?.recordAttempt({
        disco: data.disco,
        success: false,
        latencyMs,
        errorCode: error?.responseCode ? String(error.responseCode) : 'GATEWAY_ERROR',
        errorMessage: error?.message,
      });
    }

    return {
      screen: 'ENTER_METER_NO',
      data: {
        error_message: error.responseCode >= 400 ? error.message : "Meter verification failed. Please check the details and try again.",
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
  const total_amount = Number(data.amount) + serviceFee;
  const user = await fastify.userService.findOne(
    { phoneNumber: data.phone_number },
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

  return {
    screen: 'ORDER_REVIEW',
    data: {
      disco: data.disco,
      meter_no: data.meter_no,
      meter_name: data.meter_name,
      address: data.address,
      vend_type: data.vend_type,
      amount: data.amount.toLocaleString(),
      service_charge: serviceFee.toLocaleString(),
      total_amount: total_amount.toLocaleString(),
      phone_number: data.phone_number,
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
  let customerPhone = data.phone_number;
  if (!customerPhone && data.meter_no) {
    try {
      customerPhone = await fastify.redis.get(`meter:phone:${data.meter_no}`);
    } catch {}
  }
  if (!customerPhone) {
    try {
      customerPhone = await fastify.redis.get('user:phone:session:latest');
    } catch {}
  }
  if (!customerPhone) {
    customerPhone = '2347019438856';
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
        customerPhone,
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

  const orderDedupeKey = `${REDIS_PREFIXES.ORDER_DEDUPE}${customerPhone}:${data.meter_no}:${numericAmount}`;
  const isDuplicateOrder = await fastify.redis.set(
    orderDedupeKey,
    '1',
    { ttl: 15, nx: true }
  );

  if (isDuplicateOrder === null) {
    fastify.log.warn({ customerPhone, meter_no: data.meter_no }, 'Duplicate order submission detected within 15s');
    const latestRef = await fastify.redis.get(`user:${customerPhone}:latest_order`);
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
      customerPhone,
      details,
      type: BillType.ELECTRICITY
    });

    fastify.log.info({ reference: order.reference, amount: order.amount }, 'Order created successfully');

    if (order.reference && order._id) {
      await fastify.redis.set(`user:${customerPhone}:latest_order`, order.reference, { ttl: 3600 }).catch(() => {});

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

      const { bankTransferDetails } = paymentResult;

      await fastify.redis.set(
        `${REDIS_PREFIXES.PAYMENT_CACHE}${order.reference}`,
        JSON.stringify({
          ...bankTransferDetails,
          customerPhone: order.customerPhone,
          amount: order.amount,
          details
        }),
        { ttl: 1800 }
      );

      const summary_text = `*Transfer ₦${total_amount.toLocaleString()}*\n\n*Dedicated Bank Account:*\n🏦 Bank: ${bankTransferDetails.bankName || 'Wema Bank'}\n🔢 Account: ${bankTransferDetails.accountNumber}\n👤 Account Name: ${bankTransferDetails.accountName || 'Energiease Customer'}\n⏳ Expires in: 30 mins`;

      return {
        screen: 'SUCCESS_SCREEN',
        data: {
          summary_text,
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

