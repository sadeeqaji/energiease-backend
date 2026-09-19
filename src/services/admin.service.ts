import OrderModel from '@/models/order.model';
import UserModel from '@/models/user.model';
import { MeterModel } from '@/models/meter.model';
import AdminModel from '@/models/admin.model';
import { roles } from '@/utils/rbac.util';
import buyPowerService from './buypower.service';
import { WhatsAppService } from './whatsapp.service';
import { ELECTRICITY_PURCHASE_CONFIRMATION } from '@/constants/whatsapp.flow';
import { AppException } from '@/utils/appException.utils';

export class AdminService {
  private whatsappService: WhatsAppService;

  constructor() {
    this.whatsappService = new WhatsAppService();
  }

  /**
   * Get high-level executive dashboard statistics
   */
  async getDashboardStats(monnifyService?: any, requesterRole?: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalOrdersCount,
      successfulOrders,
      pendingOrdersCount,
      interventionOrdersCount,
      todayOrders,
      walletData,
      monnifyWalletData,
    ] = await Promise.all([
      OrderModel.countDocuments(),
      OrderModel.find({ status: 'success' }).lean(),
      OrderModel.countDocuments({ status: { $in: ['pending_payment', 'processing'] } }),
      OrderModel.countDocuments({ requiresManualIntervention: true }),
      OrderModel.find({ status: 'success', createdAt: { $gte: today } }).lean(),
      buyPowerService.getWalletBalance().catch((err) => {
        console.error('Failed to get wallet balance in admin stats:', err?.message);
        return { balance: 0, commission: 0 };
      }),
      monnifyService?.getWalletBalance().catch((err: any) => {
        console.error('Failed to get Monnify balance in admin stats:', err?.message);
        return { availableBalance: 0, ledgerBalance: 0 };
      }),
    ]);

    const totalCustomerPaid = successfulOrders.reduce((sum, o) => sum + (o.amount || 0), 0);
    const totalUnits = successfulOrders.reduce((sum, o) => {
      const u = Number((o as any).providerResponse?.units || (o.details as any)?.units) || 0;
      return sum + u;
    }, 0);

    const totalServiceFees = successfulOrders.reduce((sum, o) => sum + (o.serviceFee || 100), 0);
    const totalVendAmount = successfulOrders.reduce((sum, o) => sum + Math.max((o.amount || 0) - (o.serviceFee || 100), 0), 0);
    const totalBuyPowerCommission = Math.round(totalVendAmount * 0.015 * 100) / 100;
    const totalMonnifyFees = Math.round(totalCustomerPaid * 0.016125 * 100) / 100;
    const netProfit = Math.round((totalServiceFees + totalBuyPowerCommission - totalMonnifyFees) * 100) / 100;

    const todayCustomerPaid = todayOrders.reduce((sum, o) => sum + (o.amount || 0), 0);
    const todayVendAmount = todayOrders.reduce((sum, o) => sum + Math.max((o.amount || 0) - (o.serviceFee || 100), 0), 0);
    const todayBuyPowerCommission = Math.round(todayVendAmount * 0.015 * 100) / 100;
    const todayMonnifyFees = Math.round(todayCustomerPaid * 0.016125 * 100) / 100;
    const todayNetProfit = Math.round((todayOrders.length * 100 + todayBuyPowerCommission - todayMonnifyFees) * 100) / 100;

    const successCount = successfulOrders.length;
    const successRate = totalOrdersCount > 0 ? Math.round((successCount / totalOrdersCount) * 1000) / 10 : 100;

    const isSupport = requesterRole === 'support';

    return {
      kpis: {
        totalRevenue: totalCustomerPaid,
        totalVendAmount,
        totalServiceFees,
        totalBuyPowerCommission: isSupport ? 0 : totalBuyPowerCommission,
        totalMonnifyFees: isSupport ? 0 : totalMonnifyFees,
        netProfit: isSupport ? 0 : netProfit,
        totalOrders: totalOrdersCount,
        successOrders: successCount,
        pendingOrders: pendingOrdersCount,
        interventionRequired: interventionOrdersCount,
        successRate,
        totalUnitsDelivered: Math.round(totalUnits * 10) / 10,
        today: {
          ordersCount: todayOrders.length,
          customerPaid: todayCustomerPaid,
          vendAmount: todayVendAmount,
          netProfit: isSupport ? 0 : todayNetProfit,
        },
      },
      wallet: {
        provider: 'buypower',
        balance: Number(walletData.balance) || 0,
        commissionBalance: isSupport ? 0 : (Number(walletData.commission) || 0),
        status: (Number(walletData.balance) || 0) < 50000 ? 'CRITICAL' : (Number(walletData.balance) || 0) < 100000 ? 'WARNING' : 'HEALTHY',
      },
      monnifyWallet: {
        provider: 'monnify',
        availableBalance: Number(monnifyWalletData?.availableBalance) || 0,
        ledgerBalance: Number(monnifyWalletData?.ledgerBalance) || 0,
      },
    };
  }

  /**
   * Order trends by day for charting
   */
  async getOrderTrends(days: number = 14) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (days - 1));
    startDate.setHours(0, 0, 0, 0);

    const orders = await OrderModel.find({
      createdAt: { $gte: startDate },
    }).sort({ createdAt: 1 }).lean();

    const trendMap: Record<string, { date: string; totalSales: number; ordersCount: number; successCount: number; netProfit: number }> = {};

    // Initialize all dates in range
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      trendMap[key] = { date: key, totalSales: 0, ordersCount: 0, successCount: 0, netProfit: 0 };
    }

    for (const order of orders) {
      const key = new Date(order.createdAt).toISOString().split('T')[0];
      if (!trendMap[key]) continue;

      trendMap[key].ordersCount++;
      if (order.status === 'success') {
        trendMap[key].successCount++;
        const paid = order.amount || 0;
        const fee = order.serviceFee || 100;
        const vend = Math.max(paid - fee, 0);
        const buypowerComm = vend * 0.015;
        const monnifyFee = paid * 0.016125;
        const profit = fee + buypowerComm - monnifyFee;

        trendMap[key].totalSales += paid;
        trendMap[key].netProfit += profit;
      }
    }

    return Object.values(trendMap).map(row => ({
      ...row,
      totalSales: Math.round(row.totalSales),
      netProfit: Math.round(row.netProfit * 100) / 100,
    }));
  }

  /**
   * Real-time DISCO operational health status
   */
  async getDiscoHealth() {
    const last48h = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const recentOrders = await OrderModel.find({
      createdAt: { $gte: last48h },
      type: 'ELECTRICITY',
    }).lean();

    const discoStats: Record<string, { total: number; success: number; failed: number }> = {};
    const defaultDiscos = ['IKEDC', 'EKEDC', 'AEDC', 'IBEDC', 'EEDC', 'PHED', 'KAEDCO', 'KEDCO', 'BEDC', 'YEDC', 'APLE'];

    for (const disco of defaultDiscos) {
      discoStats[disco] = { total: 0, success: 0, failed: 0 };
    }

    for (const o of recentOrders) {
      const discoCode = String((o.details as any)?.disco || '').toUpperCase();
      if (!discoCode) continue;
      if (!discoStats[discoCode]) {
        discoStats[discoCode] = { total: 0, success: 0, failed: 0 };
      }
      discoStats[discoCode].total++;
      if (o.status === 'success') {
        discoStats[discoCode].success++;
      } else if (o.status === 'failed') {
        discoStats[discoCode].failed++;
      }
    }

    return Object.entries(discoStats).map(([disco, stat]) => {
      const successRate = stat.total > 0 ? Math.round((stat.success / stat.total) * 100) : 100;
      let status: 'OPERATIONAL' | 'DEGRADED' | 'DOWN' = 'OPERATIONAL';
      if (stat.total >= 3) {
        if (successRate < 50) status = 'DOWN';
        else if (successRate < 85) status = 'DEGRADED';
      }

      return {
        disco,
        status,
        totalOrders: stat.total,
        successOrders: stat.success,
        failedOrders: stat.failed,
        successRate,
      };
    });
  }

  /**
   * Search and filter orders with pagination
   */
  async listOrders(query: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    disco?: string;
    interventionOnly?: boolean;
    startDate?: string;
    endDate?: string;
  }, requesterRole?: string) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};

    if (query.status && query.status !== 'all') {
      filter.status = query.status;
    }

    if (query.interventionOnly) {
      filter.requiresManualIntervention = true;
    }

    if (query.disco && query.disco !== 'all') {
      filter['details.disco'] = new RegExp(`^${query.disco}$`, 'i');
    }

    if (query.startDate || query.endDate) {
      filter.createdAt = {};
      if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
      if (query.endDate) {
        const end = new Date(query.endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      filter.$or = [
        { reference: { $regex: term, $options: 'i' } },
        { customerPhone: { $regex: term, $options: 'i' } },
        { 'details.meterNumber': { $regex: term, $options: 'i' } },
        { providerOrderId: { $regex: term, $options: 'i' } },
      ];
    }

    const [total, orders] = await Promise.all([
      OrderModel.countDocuments(filter),
      OrderModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const isSupport = requesterRole === 'support';

    const formattedOrders = orders.map((o) => {
      const d = (o.details || {}) as any;
      const paid = o.amount || 0;
      const fee = o.serviceFee || 100;
      const vend = Math.max(paid - fee, 0);
      const buypowerComm = Math.round(vend * 0.015 * 100) / 100;
      const monnifyFee = Math.round(paid * 0.016125 * 100) / 100;
      const netProfit = Math.round((fee + buypowerComm - monnifyFee) * 100) / 100;

      const token = (o as any).providerResponse?.token || d.token || '';
      const units = (o as any).providerResponse?.units || d.units || d.unit || '';

      return {
        id: o._id,
        reference: o.reference,
        customerPhone: o.customerPhone,
        amount: paid,
        vendAmount: vend,
        serviceFee: fee,
        buypowerCommission: isSupport ? undefined : buypowerComm,
        monnifyFee: isSupport ? undefined : monnifyFee,
        netProfit: isSupport ? undefined : netProfit,
        status: o.status,
        disco: d.disco || 'N/A',
        meterNumber: d.meterNumber || 'N/A',
        meterName: d.meterName || d.name || 'Customer',
        token,
        units,
        provider: o.provider,
        requiresManualIntervention: !!o.requiresManualIntervention,
        fulfillmentFailureReason: o.fulfillmentFailureReason,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
      };
    });

    return {
      orders: formattedOrders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get complete details of a single order
   */
  async getOrderDetail(reference: string, requesterRole?: string) {
    const order = await OrderModel.findOne({ reference }).lean();
    if (!order) {
      throw AppException.NotFound(`Order not found with reference ${reference}`);
    }

    const paid = order.amount || 0;
    const fee = order.serviceFee || 100;
    const vend = Math.max(paid - fee, 0);
    const buypowerCommission = Math.round(vend * 0.015 * 100) / 100;
    const monnifyFee = Math.round(paid * 0.016125 * 100) / 100;
    const netProfit = Math.round((fee + buypowerCommission - monnifyFee) * 100) / 100;

    const isSupport = requesterRole === 'support';

    return {
      ...order,
      buypowerCommission: isSupport ? undefined : buypowerCommission,
      monnifyFee: isSupport ? undefined : monnifyFee,
      netProfit: isSupport ? undefined : netProfit,
      financials: isSupport
        ? {
            amountPaid: paid,
            vendCost: vend,
            serviceFee: fee,
          }
        : {
            amountPaid: paid,
            vendCost: vend,
            serviceFee: fee,
            buypowerCommission,
            monnifyFee,
            netProfit,
          },
    };
  }

  /**
   * Resend token to customer via WhatsApp
   */
  async resendTokenViaWhatsApp(reference: string) {
    const order = await OrderModel.findOne({ reference }).lean();
    if (!order) {
      throw AppException.NotFound(`Order not found with reference: ${reference}`);
    }

    if (order.status !== 'success') {
      throw AppException.BadRequest(`Cannot resend token for order in status '${order.status}'`);
    }

    const details = (order.details || {}) as any;
    const token = (order as any).providerResponse?.token || details.token;
    if (!token) {
      throw AppException.BadRequest(`Order ${reference} does not have a generated token`);
    }

    const phone = order.customerPhone;
    if (!phone) {
      throw AppException.BadRequest('Order has no customer phone number');
    }

    const message = ELECTRICITY_PURCHASE_CONFIRMATION({
      to: phone,
      amount: String(order.amount),
      meterNumber: details.meterNumber || 'N/A',
      disco: details.disco || 'N/A',
      token,
      unit: (order as any).providerResponse?.units || details.units || details.unit || '0',
      orderReference: order.reference,
    });

    await this.whatsappService.sendMessage(message as Record<string, unknown>);

    return {
      success: true,
      message: `Token resent successfully to ${phone}`,
    };
  }

  /**
   * Live Re-query transaction status directly from BuyPower API
   * If BuyPower reports a token/success, update order in DB & notify customer!
   */
  async requeryBuyPowerOrder(reference: string) {
    const order = await OrderModel.findOne({ reference });
    if (!order) {
      throw AppException.NotFound(`Order not found with reference: ${reference}`);
    }

    const orderIdToQuery = order.providerOrderId || order.reference;
    let bpResponse: any = null;

    try {
      bpResponse = await buyPowerService.requeryTransaction(orderIdToQuery);
    } catch (err: any) {
      if (order.providerOrderId && order.providerOrderId !== order.reference) {
        try {
          bpResponse = await buyPowerService.requeryTransaction(order.reference);
        } catch (e: any) {
          throw AppException.BadRequest(`BuyPower re-query failed: ${err.message}`);
        }
      } else {
        throw AppException.BadRequest(`BuyPower re-query failed: ${err.message}`);
      }
    }

    const resultData = bpResponse?.result?.data || bpResponse?.data || bpResponse;
    const token = resultData?.token || resultData?.parcels?.[0]?.content;
    const units = resultData?.units;
    const receiptNo = resultData?.receiptNo;

    let updated = false;

    if (token && order.status !== 'success') {
      order.status = 'success';
      order.requiresManualIntervention = false;
      order.provider = 'buypower';
      if (order.details) {
        (order.details as any).token = token;
        if (units) (order.details as any).units = units;
        if (receiptNo) (order.details as any).receiptNo = receiptNo;
      }
      order.providerResponse = {
        ...(order.providerResponse || {}),
        ...resultData,
      };
      await order.save();
      updated = true;

      if (order.customerPhone) {
        try {
          const details = (order.details || {}) as any;
          const message = ELECTRICITY_PURCHASE_CONFIRMATION({
            to: order.customerPhone,
            amount: String(order.amount),
            meterNumber: details.meterNumber || 'N/A',
            disco: details.disco || 'N/A',
            token,
            unit: units || details.units || '0',
            orderReference: order.reference,
          });
          await this.whatsappService.sendMessage(message as Record<string, unknown>);
        } catch (msgErr) {
          console.error('[AdminService] Failed to send WhatsApp after requery:', msgErr);
        }
      }
    } else if (resultData) {
      order.providerResponse = {
        ...(order.providerResponse || {}),
        ...resultData,
      };
      await order.save();
    }

    return {
      success: true,
      updated,
      orderStatus: order.status,
      buypowerData: resultData,
      token: token || null,
      message: updated 
        ? `BuyPower fulfilled transaction! Token ${token} synced and order marked as Success.`
        : (resultData?.responseMessage || 'BuyPower returned current order telemetry.'),
    };
  }

  /**
   * Live Payment Verification directly from Monnify API
   */
  async verifyMonnifyPayment(reference: string, monnifyService: any) {
    const order = await OrderModel.findOne({ reference });
    if (!order) {
      throw AppException.NotFound(`Order not found with reference: ${reference}`);
    }

    if (!monnifyService) {
      throw AppException.InternalServerError('Monnify service is not configured');
    }

    const monnifyData = await monnifyService.queryTransaction(reference);

    let updated = false;
    if (monnifyData?.paymentStatus === 'PAID' && order.status === 'pending_payment') {
      order.paymentConfirmedAt = new Date(monnifyData.paidOn || Date.now());
      order.status = 'processing';
      await order.save();
      updated = true;
    }

    return {
      success: true,
      updated,
      orderStatus: order.status,
      monnify: {
        paymentReference: monnifyData?.paymentReference,
        transactionReference: monnifyData?.transactionReference,
        amountPaid: monnifyData?.amountPaid,
        payableAmount: monnifyData?.payableAmount,
        paymentStatus: monnifyData?.paymentStatus,
        paymentMethod: monnifyData?.paymentMethod,
        fee: monnifyData?.fee,
        settlementAmount: monnifyData?.settlementAmount,
        paidOn: monnifyData?.paidOn,
      },
      message: `Monnify reports payment status: ${monnifyData?.paymentStatus || 'UNKNOWN'}`,
    };
  }

  /**
   * Initiate customer refund through Monnify
   */
  async initiateMonnifyRefund(reference: string, reason: string, monnifyService: any) {
    const order = await OrderModel.findOne({ reference });
    if (!order) {
      throw AppException.NotFound(`Order not found with reference: ${reference}`);
    }

    if (!monnifyService) {
      throw AppException.InternalServerError('Monnify service is not configured');
    }

    const monnifyData = await monnifyService.queryTransaction(reference);
    if (!monnifyData?.transactionReference) {
      throw AppException.BadRequest('Cannot refund order: No Monnify transaction reference found');
    }

    const refundRes = await monnifyService.initiateRefund({
      transactionReference: monnifyData.transactionReference,
      refundAmount: order.amount,
      refundReason: reason || 'Customer refund requested for unfulfilled electricity order',
    });

    order.fulfillmentFailureReason = `Refunded: ${reason || 'Unfulfilled order'}`;
    order.status = 'failed';
    order.requiresManualIntervention = false;
    await order.save();

    return {
      success: true,
      message: 'Refund successfully initiated with Monnify',
      refundData: refundRes,
    };
  }

  /**
   * Search transactions across Monnify gateway for auditing
   */
  async getMonnifyTransactions(params: any, monnifyService: any) {
    if (!monnifyService) {
      throw AppException.InternalServerError('Monnify service is not configured');
    }
    return monnifyService.searchTransactions(params);
  }

  /**
   * Accounting and Financial Reconciliation Summary
   */
  async getAccountingSummary(startDate?: string, endDate?: string, monnifyService?: any) {
    const filter: Record<string, any> = { status: 'success' };
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    const [orders, walletData, monnifyWalletData] = await Promise.all([
      OrderModel.find(filter).sort({ createdAt: -1 }).lean(),
      buyPowerService.getWalletBalance().catch(() => ({ balance: 0, commission: 0 })),
      monnifyService ? monnifyService.getWalletBalance().catch(() => ({ availableBalance: 0, ledgerBalance: 0 })) : Promise.resolve({ availableBalance: 0, ledgerBalance: 0 }),
    ]);

    let totalCustomerPaid = 0;
    let totalVendCost = 0;
    let totalServiceFees = 0;
    let totalBuyPowerCommission = 0;
    let totalMonnifyFees = 0;

    const dailyLedger: Record<string, {
      date: string;
      ordersCount: number;
      grossCustomerPaid: number;
      discoEnergyCost: number;
      serviceFeeRevenue: number;
      buypowerCommission: number;
      monnifyFees: number;
      netProfit: number;
    }> = {};

    for (const order of orders) {
      const paid = order.amount || 0;
      const fee = order.serviceFee || 100;
      const vend = Math.max(paid - fee, 0);
      const buypowerComm = Math.round(vend * 0.015 * 100) / 100;
      const monnifyFee = Math.round(paid * 0.016125 * 100) / 100;
      const profit = Math.round((fee + buypowerComm - monnifyFee) * 100) / 100;

      totalCustomerPaid += paid;
      totalVendCost += vend;
      totalServiceFees += fee;
      totalBuyPowerCommission += buypowerComm;
      totalMonnifyFees += monnifyFee;

      const dateKey = new Date(order.createdAt).toISOString().split('T')[0];
      if (!dailyLedger[dateKey]) {
        dailyLedger[dateKey] = {
          date: dateKey,
          ordersCount: 0,
          grossCustomerPaid: 0,
          discoEnergyCost: 0,
          serviceFeeRevenue: 0,
          buypowerCommission: 0,
          monnifyFees: 0,
          netProfit: 0,
        };
      }

      dailyLedger[dateKey].ordersCount++;
      dailyLedger[dateKey].grossCustomerPaid += paid;
      dailyLedger[dateKey].discoEnergyCost += vend;
      dailyLedger[dateKey].serviceFeeRevenue += fee;
      dailyLedger[dateKey].buypowerCommission += buypowerComm;
      dailyLedger[dateKey].monnifyFees += monnifyFee;
      dailyLedger[dateKey].netProfit += profit;
    }

    const netProfitMargin = Math.round((totalServiceFees + totalBuyPowerCommission - totalMonnifyFees) * 100) / 100;

    return {
      summary: {
        totalOrders: orders.length,
        grossCustomerPaid: totalCustomerPaid,
        discoEnergyCost: totalVendCost,
        serviceFeeRevenue: totalServiceFees,
        buypowerCommission: Math.round(totalBuyPowerCommission * 100) / 100,
        monnifyFees: Math.round(totalMonnifyFees * 100) / 100,
        netProfitMargin,
      },
      buypowerWallet: {
        balance: Number(walletData.balance) || 0,
        commissionBalance: Number(walletData.commission) || 0,
      },
      monnifyWallet: {
        availableBalance: Number(monnifyWalletData?.availableBalance) || 0,
        ledgerBalance: Number(monnifyWalletData?.ledgerBalance) || 0,
      },
      ledger: Object.values(dailyLedger).map(row => ({
        ...row,
        grossCustomerPaid: Math.round(row.grossCustomerPaid),
        discoEnergyCost: Math.round(row.discoEnergyCost),
        serviceFeeRevenue: Math.round(row.serviceFeeRevenue),
        buypowerCommission: Math.round(row.buypowerCommission * 100) / 100,
        monnifyFees: Math.round(row.monnifyFees * 100) / 100,
        netProfit: Math.round(row.netProfit * 100) / 100,
      })),
    };
  }

  /**
   * Export detailed transaction accounting rows for CSV/Audit
   */
  async exportAccounting(startDate?: string, endDate?: string) {
    const filter: Record<string, any> = { status: 'success' };
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    const orders = await OrderModel.find(filter).sort({ createdAt: -1 }).lean();

    return orders.map(order => {
      const d = (order.details || {}) as any;
      const paid = order.amount || 0;
      const fee = order.serviceFee || 100;
      const vend = Math.max(paid - fee, 0);
      const buypowerCommission = Math.round(vend * 0.015 * 100) / 100;
      const monnifyFee = Math.round(paid * 0.016125 * 100) / 100;
      const netProfit = Math.round((fee + buypowerCommission - monnifyFee) * 100) / 100;

      return {
        reference: order.reference,
        date: order.createdAt,
        customerPhone: order.customerPhone,
        meterNumber: d.meterNumber || 'N/A',
        disco: d.disco || 'N/A',
        customerPaid: paid,
        discoEnergyCost: vend,
        serviceFeeEarned: fee,
        buypowerCommissionEarned: buypowerCommission,
        monnifyFeeDeducted: monnifyFee,
        netProfitEarned: netProfit,
        token: (order as any).providerResponse?.token || d.token || 'N/A',
        status: order.status,
      };
    });
  }

  /**
   * Search customers with their saved meters and total orders
   */
  async getCustomers(query: { page?: number; limit?: number; search?: string }) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};
    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      filter.$or = [
        { phoneNumber: { $regex: term, $options: 'i' } },
        { firstName: { $regex: term, $options: 'i' } },
        { lastName: { $regex: term, $options: 'i' } },
      ];
    }

    const [total, users] = await Promise.all([
      UserModel.countDocuments(filter),
      UserModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    const enrichedUsers = await Promise.all(
      users.map(async (user) => {
        const [meters, orderStats] = await Promise.all([
          MeterModel.find({ phoneNumber: user.phoneNumber }).lean(),
          OrderModel.aggregate([
            { $match: { customerPhone: user.phoneNumber, status: 'success' } },
            { $group: { _id: null, totalSpent: { $sum: '$amount' }, count: { $sum: 1 } } },
          ]),
        ]);

        return {
          id: user._id,
          phoneNumber: user.phoneNumber,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Customer',
          meters: meters.map(m => ({
            meterNumber: m.meterNumber,
            disco: m.discoCode,
            name: m.name,
            address: m.address,
            vendType: m.vendType,
          })),
          totalOrders: orderStats[0]?.count || 0,
          totalSpent: orderStats[0]?.totalSpent || 0,
          createdAt: user.createdAt,
        };
      })
    );

    return {
      customers: enrichedUsers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * List all staff accounts (Super Admin only)
   */
  async listStaffUsers() {
    const users = await AdminModel.find()
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();

    return users.map((u) => ({
      id: u._id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      role: u.role,
      permissions: u.permissions || [],
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));
  }

  /**
   * Create a new staff account (Super Admin only)
   */
  async createStaffUser(data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    role: 'superadmin' | 'admin' | 'support' | 'accounting';
  }) {
    const { firstName, lastName, email, password, role } = data;
    if (!firstName || !lastName || !email || !password || !role) {
      throw AppException.BadRequest('Missing required fields: firstName, lastName, email, password, role');
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await AdminModel.findOne({ email: normalizedEmail });
    if (existing) {
      throw AppException.Conflict(`Staff user already exists with email: ${normalizedEmail}`);
    }

    const assignedPermissions = roles[role] || [];

    const newAdmin = new AdminModel({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: normalizedEmail,
      password,
      role,
      permissions: assignedPermissions,
    });

    await newAdmin.save();

    return {
      id: newAdmin._id,
      firstName: newAdmin.firstName,
      lastName: newAdmin.lastName,
      email: newAdmin.email,
      role: newAdmin.role,
      permissions: newAdmin.permissions,
      createdAt: newAdmin.createdAt,
    };
  }

  /**
   * Delete a staff user (Super Admin only)
   */
  async deleteStaffUser(targetUserId: string, requesterUserId: string) {
    if (targetUserId === requesterUserId) {
      throw AppException.BadRequest('You cannot delete your own active superadmin account');
    }

    const target = await AdminModel.findById(targetUserId);
    if (!target) {
      throw AppException.NotFound('Staff user not found');
    }

    if (target.email === 'sadiq@energiease.ng') {
      throw AppException.Forbidden('The primary founder account (sadiq@energiease.ng) cannot be removed');
    }

    await AdminModel.findByIdAndDelete(targetUserId);
    return { success: true, message: `Staff user ${target.email} removed successfully` };
  }
}

export default new AdminService();
