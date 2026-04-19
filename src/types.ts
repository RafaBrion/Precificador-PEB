export interface Product {
  sku: string;
  cost: number;
  desiredMargin?: number; // percentage (e.g., 0.30 for 30%)
}

export interface ChannelConfig {
  id: string;
  name: string;
  commission: number; // percentage (0.18 for 18%)
  commissionPremium?: number; // for ML
  fixedFee: number; // R$
  tax: number; // percentage (0.06 for 6%)
  extraFixedCost: number; // R$ (e.g., packaging)
  shippingCost?: number; // R$ (fixed shipping)
  ads: number; // percentage (e.g., marketing)
  color: string;
}

export interface CalculationResult {
  sku: string;
  cost: number;
  channels: {
    [channelId: string]: {
      sellingPrice: number;
      marginAmount: number;
      marginPercent: number;
      fees: number;
      taxes: number;
      adsAmount: number;
      extraFixedAmount: number;
      shippingAmount?: number;
    };
  };
}
