// import axios from 'axios';
// import { BillProvider, BillType } from '@/interfaces/providers.interface';
// import { VTPassConfig } from '@/config/vtpass.config';
// import { AppException } from '@/utils/appException.utils';

// type VTPassService = {
//     serviceID: string;
//     variationCode?: string;
// };

// export class VTPassProvider implements BillProvider {
//     name = 'vtpass';
//     priority = 2;
//     supportedBillTypes: BillType[] = ['electricity', 'airtime', 'cable'];

//     private serviceMapping: Record<BillType, (details: any) => VTPassService> = {
//         electricity: (details) => ({
//             serviceID: this.getElectricityServiceID(details.disco),
//             variationCode: this.getVariationCode(details.vendType)
//         }),
//         airtime: (details) => ({
//             serviceID: this.getAirtimeServiceID(details.network)
//         }),
//         cable: (details) => ({
//             serviceID: this.getCableServiceID(details.provider),
//             variationCode: details.packageCode
//         })
//     };

//     async vend(
//         billType: BillType,
//         details: Record<string, any>,
//         userInfo: { phone: string; email: string; name: string }
//     ) {
//         try {
//             const serviceConfig = this.serviceMapping[billType](details);
//             const payload = this.createPayload(billType, details, serviceConfig, userInfo);

//             const response = await axios.post(
//                 `${VTPassConfig.baseUrl}/pay`,
//                 payload,
//                 { headers: { 'api-key': VTPassConfig.apiKey } }
//             );

//             return {
//                 success: response.data.code === '000',
//                 orderId: response.data.requestId
//             };
//         } catch (error) {
//             this.handleVendError(error);
//         }
//     }

//     private createPayload(
//         billType: BillType,
//         details: any,
//         serviceConfig: VTPassService,
//         userInfo: { phone: string }
//     ) {
//         const basePayload: Record<string, any> = {
//             request_id: this.generateRequestId(),
//             serviceID: serviceConfig.serviceID,
//             amount: details.amount,
//             phone: userInfo.phone
//         };

//         switch (billType) {
//             case 'electricity':
//                 basePayload.billersCode = details.meterNumber;
//                 basePayload.variation_code = serviceConfig.variationCode;
//                 break;
//             case 'cable':
//                 basePayload.billersCode = details.smartcard;
//                 basePayload.variation_code = serviceConfig.variationCode;
//                 break;
//             case 'airtime':
//                 basePayload.amount = details.amount;
//                 break;
//         }

//         return basePayload;
//     }

//     async validate(details: Record<string, any>) {
//         // Implement validation logic for each service type
//         return true;
//     }

//     private getElectricityServiceID(disco: string): string {
//         const services: Record<string, string> = {
//             'ikeja': 'ikeja-electric',
//             'eko': 'eko-electric',
//             'abuja': 'abuja-electric'
//         };
//         return services[disco.toLowerCase()] || 'default-electric';
//     }

//     private getVariationCode(vendType: string): string {
//         return vendType === 'prepaid' ? 'prepaid' : 'postpaid';
//     }

//     private getAirtimeServiceID(network: string): string {
//         const services: Record<string, string> = {
//             'mtn': 'mtn-airtime',
//             'airtel': 'airtel-airtime',
//             'glo': 'glo-airtime',
//             '9mobile': '9mobile-airtime'
//         };
//         return services[network.toLowerCase()] || 'mtn-airtime';
//     }

//     private getCableServiceID(provider: string): string {
//         const services: Record<string, string> = {
//             'dstv': 'dstv',
//             'gotv': 'gotv',
//             'startimes': 'startimes'
//         };
//         return services[provider.toLowerCase()] || 'dstv';
//     }

//     private generateRequestId() {
//         return `VTP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
//     }

//     private handleVendError(error: any): never {
//         if (axios.isAxiosError(error)) {
//             throw new AppException(
//                 error.response?.status || 500,
//                 error.response?.data?.response_description || 'VTPass transaction failed',
//                 error.response?.data
//             );
//         }
//         throw error;
//     }
// }