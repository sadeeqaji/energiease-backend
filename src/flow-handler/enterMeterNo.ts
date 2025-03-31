import { REDIS_PREFIXES } from '@/constants/redisPrefix';
import { serviceFee } from '@/constants/serviceFee';
import buyPowerService from '@/services/buypower.service';
// import meterService from '@/services/meter.service';
import { BillType } from '@/types/bill.types';
import { DecryptedResponse } from '@/types/whatsapp.types';
import { AppException } from '@/utils/appException.utils';
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
    const cacheKey = `${REDIS_PREFIXES.METER_CACHE_PREFIX}saved:${data.phone_number}`;
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

  return {
    screen: 'ENTER_METER_NO',
    data: { phone_number: data.phone_number },
  };
}

async function handleSavedMeters(data: any, fastify: FastifyInstance) {
  const meterCacheKey = `${REDIS_PREFIXES.METER_CACHE_PREFIX}detail:${data.selected_meter}`;
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
        phone_number: data.phone_number
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
    service_charge: serviceFee.toLocaleString()
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
      phone_number: data.phone_number
    }
  };
}

async function handleNewMeter(data: any, fastify: FastifyInstance) {

  if (!data?.meter_no || !data?.disco || !data?.vend_type) {
    throw AppException.BadRequest('Missing required parameters');
  }

  // Check for cached meter details first
  const meterCacheKey = `${REDIS_PREFIXES.METER_CACHE_PREFIX}detail:${data.meter_no}:${data.disco}`;
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
        phone_number: data.phone_number
      }
    };
  }

  // Check for ongoing validation
  const meterValidationKey = `${REDIS_PREFIXES.METER_VALIDATION_PREFIX}${data.meter_no}:${data.disco}`;
  const isDuplicateValidation = await fastify.redis.set(
    meterValidationKey,
    '1',
    { ttl: 60, nx: true }
  );

  if (isDuplicateValidation === null) {
    // Double-check cache in case validation completed
    const recentlyCachedDetails = await fastify.redis.get(meterCacheKey);
    const total_amount = Number(data.amount) + serviceFee

    if (recentlyCachedDetails) {
      return {
        screen: 'ORDER_REVIEW',
        data: {
          ...JSON.parse(recentlyCachedDetails),
          amount: data.amount.toLocaleString(),
          total_amount: total_amount.toLocaleString(),
          service_charge: serviceFee.toLocaleString(),
          phone_number: data.phone_number
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
    const total_amount = Number(data.amount) + serviceFee
    return {
      screen: 'ORDER_REVIEW',
      data: {
        ...reviewData,
        amount: data.amount.toLocaleString(),
        service_charge: serviceFee.toLocaleString(),
        total_amount: total_amount.toLocaleString(),
        phone_number: data.phone_number
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
  const orderDedupeKey = `${REDIS_PREFIXES.ORDER_DEDUPE_PREFIX}${data.phone_number}:${data.meter_no}:${data.amount}`;
  const isDuplicateOrder = await fastify.redis.set(
    orderDedupeKey,
    '1',
    { ttl: 300, nx: true }
  );

  if (isDuplicateOrder === null) {
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


    if (order.reference && order._id) {
      const { provider, paymentUrl, bankTransferDetails } = await fastify.paymentService.initializePayment(order);
      await fastify.redis.set(
        `${REDIS_PREFIXES.PAYMENT_CACHE_PREFIX}${order.reference}`,
        JSON.stringify({
          ...bankTransferDetails,
          customerPhone: order.customerPhone,
          amount: order.amount,
          details
        }),
        { ttl: 1800 }
      );
      const total_amount = Number(data.amount) + serviceFee
      console.log(paymentUrl, 'paymentUrl')
      return {
        screen: 'PAYMENT',
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

  return {
    screen: 'ORDER_REVIEW',
    data: {
      error_message: "Failed to create order. Please try again.",
      ...data
    },
  };
}