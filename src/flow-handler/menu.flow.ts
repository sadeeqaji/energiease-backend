import { DecryptedResponse } from '@/types/whatsapp.types';
import userService from '@/services/user.service';
import { formatCurrency } from '@/utils/formatCurrency';

export const handleMenuFlow = async (decryptedBody: DecryptedResponse) => {
  const { data, screen } = decryptedBody;

  switch (screen) {
    case 'MENU':
      if (data.selected_menu === 'check_balance') {
        return {
          screen: 'AUTHENTICATE_WITH_PIN',
          data: {
            selected_menu: data.selected_menu,
            phone_number: data.phone_number,
          },
        };
      }
      if (data.selected_menu === 'upload_receipt') {
        return {
          screen: 'UPLOAD_RECEIPT',
          data: {
            selected_menu: data.selected_menu,
          },
        };
      }
      if (data.selected_menu === 'card_management') {
        return {
          screen: 'CARD_MANAGEMENT',
          data: {},
        };
      }
      return {
        screen: 'CHECK_BALANCE',
        data: {},
      };


    case 'UPLOAD_RECEIPT':
      return {
        screen: 'MENU',
        data: {},
      };

    default:
      return {
        screen: 'MENU',
        data: {},
      };
  }
};
