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
        return handleWelcomeScreen(data, fastify);

      case "SAVED_METERS":
        return handleSavedMeters(data, fastify);

      case "ENTER_METER_NO":
        return handleNewMeter(data, fastify);

      case "ORDER_REVIEW":
        return handleOrderReview(data, fastify);

      case "SETUP_DIRECT_DEBIT":
        return handleSetupDirectDebit(data, fastify);

      // case "DIRECT_DEBIT_INITIATED":
      //   return handleDirectDebitIntiation(data, fastify);

      default:
        return {
          screen: 'WELCOME_SCREEN',
          data: {},
        };
    }
  } catch (error) {
    fastify.log.error(`Error in handleEnterMeter (${screen}):`, error);
    return {
      screen,
      data: {
        error_message: "An unexpected error occurred. Please try again."
      },
    };
  }
};

async function handleWelcomeScreen(data: any, fastify: FastifyInstance) {
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
    const total_amount = Number(data.amount) + serviceFee
    return {
      screen: 'ORDER_REVIEW',
      data: {
        ...JSON.parse(cachedMeterDetails),
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
  const total_amount = Number(data.amount) + serviceFee

  return {
    screen: 'ORDER_REVIEW',
    data: {
      ...reviewData,
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
    return {
      screen: 'ORDER_REVIEW',
      data: {
        ...JSON.parse(cachedMeterDetails),
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
      return {
        screen: 'ORDER_REVIEW',
        data: {
          ...JSON.parse(recentlyCachedDetails),
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

  try {
    const meterDetails = await buyPowerService.checkMeter(
      data.meter_no,
      data.disco,
      data.vend_type
    );

    // Cache the meter details
    const reviewData = {
      disco: meterDetails.discoCode,
      meter_no: meterDetails.meterNo,
      meter_name: meterDetails.name,
      address: meterDetails.address,
      vend_type: data.vend_type,
    };

    await fastify.redis.set(meterCacheKey, JSON.stringify(reviewData), { ttl: 86400 });
    const total_amount = Number(data.amount) + serviceFee;

    return {
      screen: 'ORDER_REVIEW',
      data: {
        ...reviewData,
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

    return {
      screen: 'ENTER_METER_NO',
      data: {
        error_message: error.responseCode >= 400 ? error.message : "Meter verification failed. Please check the details and try again.",
        meter_no: data.meter_no,
        disco: data.disco,
        vend_type: data.vend_type,
        phone_number: data.phone_number
      },
    };
  }
}

async function handleOrderReview(data: any, fastify: FastifyInstance) {



  if (data.mandate_code) {
    console.log(data, 'has mandate code')
    const user = await fastify.userService.findOne(
      { phoneNumber: data.phone_number },
      { mandates: 1 }
    );
    const details = {
      meterName: data.meter_name,
      meterNumber: data.meter_no,
      meterAddress: data.address,
      disco: data.disco,
      vendType: data.vend_type,
    }

    try {
      const order = await fastify.orderService.createOrder({
        amount: data.amount,
        customerPhone: data.phone_number,
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
      })
      console.log(res, 'res')
      return {
        screen: 'ORDER_REVIEW',
        data
      }

    } catch (error) {
      console.log(error, 'error')

      return {
        screen: 'ORDER_REVIEW',
        data
      }
    }

  }

  const orderDedupeKey = `${REDIS_PREFIXES.ORDER_DEDUPE}${data.phone_number}:${data.meter_no}:${data.amount}`;
  const isDuplicateOrder = await fastify.redis.set(
    orderDedupeKey,
    '1',
    { ttl: 300, nx: true }
  );

  if (isDuplicateOrder === null) {

    console.log(data, 'data handle order review=isDuplicateOrder')

    return {
      screen: 'ORDER_REVIEW',
      data: {
        error_message: "Your order is being processed...",
        ...data
      },
    };
  }

  try {
    const details = {
      meterName: data.meter_name,
      meterNumber: data.meter_no,
      meterAddress: data.address,
      disco: data.disco,
      vendType: data.vend_type,
    }
    const order = await fastify.orderService.createOrder({
      amount: data.amount,
      customerPhone: data.phone_number,
      details,
      type: BillType.ELECTRICITY
    });

    console.log(data, 'data handle order review=creating order')

    if (order.reference && order._id) {
      const { provider, paymentUrl, bankTransferDetails } = await fastify.paymentService.initializePayment(order);


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
      const total_amount = Number(data.amount) + serviceFee
      // console.log(paymentUrl, 'paymentUrl')

      console.log(data, 'data handle order review=order created')

      return {
        screen: 'ORDER_REVIEW',
        data: {
          account_name: bankTransferDetails.accountName,
          account_no: bankTransferDetails.accountNumber,
          amount: order.amount.toLocaleString(),
          total_amount: total_amount.toLocaleString(),
          bank_name: bankTransferDetails.bankName,
          valid_until: getMinutesRemaining(bankTransferDetails.expiresOn),
          payment_provider: provider,
          payment_link: 'https://www.google.com',
          // payment_link: paymentUrl,
          order_reference: order.reference,
          phone_number: data.phone_number
        },
      };
    }
  } catch (error) {
    await fastify.redis.del(orderDedupeKey);
    throw error;
  }
  console.log("here is order")
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
        return await prepareDirectDebitResponse(data, fastify, activeMandate?.mandateReference);
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

