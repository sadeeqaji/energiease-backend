import { env } from '@/config';
import buyPowerService from '@/services/buypower.service';
import meterService from '@/services/meter.service';
import monnifyService from '@/services/monnify.service';
import orderService from '@/services/order.service';
import paymentService from '@/services/payment.service';
import { BillType } from '@/types/bill.types';
import { DecryptedResponse } from '@/types/whatsapp.types';
import { AppException } from '@/utils/appException.utils';
import { transformedMeters } from '@/utils/meter';
import { getMinutesRemaining } from '@/utils/time';

export const handleEnterMeter = async (decryptedBody: DecryptedResponse) => {
  const { data, screen } = decryptedBody;

  switch (screen) {
    case "WELCOME_SCREEN":
      if (data.selected_action === 'SAVED_METERS') {
        let error_message;
        const savedMeters = await meterService.getMetersByPhoneNumber('+2347019438856');
        const meters = transformedMeters(savedMeters)
        if (meters.length === 0) {
          error_message = "You don’t have any saved meters yet. To make future purchases faster, enter your meter number now, and we’ll save it for next time!"
          return {
            screen: 'WELCOME_SCREEN',
            data: {
              error_message
            },
          };
        }
        return {
          screen: 'SAVED_METERS',
          data: {
            saved_meters: meters,
            error_message
          },
        };
      }
      return {
        screen: 'ENTER_METER_NO',
        data: {
        },
      };
      break;

    case "SAVED_METERS":
      const meterDetails = await meterService.getMeter({ id: data.selected_meter })
      return {
        screen: 'ORDER_REVIEW',
        data: {
          disco: meterDetails?.discoCode,
          meter_no: meterDetails?.meterNumber,
          meter_name: meterDetails?.name,
          address: meterDetails?.address,
          amount: data.amount,
          vend_type: meterDetails?.vendType,
          service_charge: "Service Charge: ₦100"
        },
      };

    case "ENTER_METER_NO":
      if (!data?.meter_no || !data?.disco || !data?.vend_type) {
        throw AppException.BadRequest('Missing required parameters');
      }

      try {
        const meterDetails = await buyPowerService.checkMeter(
          data.meter_no,
          data.disco,
          data.vend_type
        );

        return {
          screen: 'ORDER_REVIEW',
          data: {
            disco: meterDetails.discoCode,
            meter_no: meterDetails.meterNo,
            meter_name: meterDetails.name,
            address: meterDetails.address,
            amount: data.amount,
            vend_type: data.vend_type,
            service_charge: "Service Charge: ₦100"
          },
        };
        break;
      } catch (error: any) {
        return {
          screen: 'ENTER_METER_NO',
          data: {
            error_message: error.responseCode === 400 ? error.message : "Please enter a valid date."
          },
        };
      }



    case "ORDER_REVIEW":
      try {
        const order = await orderService.createOrder({
          amount: data.amount,
          customerPhone: '+2347019438856',
          details: {
            meterName: data.meter_name,
            meterNumber: data.meter_no,
            meterAddress: data.address,
            disco: data.disco,
            vendType: data.vend_type,
          },
          type: BillType.ELECTRICITY,
          user: '67cb254cf55a6cd19cc61d33'
        })
        if (order.reference && order._id) {
          const { paymentUrl, bankTransferDetails } = await paymentService.initializePayment(order)
          return {
            screen: 'PAYMENT',
            data: {
              "account_name": `Account Number: ${bankTransferDetails.accountName}`,
              "account_no": `Account Number: ${bankTransferDetails.accountNumber}`,
              "amount": `Account Number: ${order.amount}`,
              "bank_name": `Bank Name: ${bankTransferDetails.bankName}`,
              "valid_until": getMinutesRemaining(bankTransferDetails.expiresOn),
              "payment_link": `${paymentUrl}`,
              "order_reference": order.reference
            },
          };
        }
      } catch (error) {
        console.log(error, 'initializePayment');
      }


    // return {
    //   screen: 'ORDER_REVIEW',
    //   data: {
    //     disco: meterDetails.discoCode,
    //     meter_no: meterDetails.meterNo,
    //     meter_name: meterDetails.name,
    //     address: meterDetails.address,
    //     amount: data.amount,
    //     vend_type: data.vend_type,
    //     service_charge: "Service Charge: ₦100"
    //   },
    // };
    // break;

    default:
      return {
        screen: 'WELCOME_SCREEN',
        data: {

        },
      };
  }



};