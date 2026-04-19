import { Product, ChannelConfig, CalculationResult } from '../types';

/**
 * Formula: SellingPrice = (Cost + FixedFee) / (1 - Commission - DesiredMargin)
 * This ensures the margin is calculated on the selling price.
 */
export function calculatePrices(
  products: Product[],
  channels: ChannelConfig[],
  desiredMargin: number // e.g., 0.20 for 20%
): CalculationResult[] {
  return products.map((product) => {
    const results: CalculationResult['channels'] = {};

    channels.forEach((channel) => {
      const vTax = channel.tax;
      const vAds = channel.ads;
      const vMargin = product.desiredMargin !== undefined ? product.desiredMargin : desiredMargin;
      const fExt = channel.extraFixedCost;
      const cost = product.cost;

      // Dynamic calculation for marketplaces
      let vComm = channel.commission;
      let fChan = channel.fixedFee;
      let fShip = channel.shippingCost || 0;

      const calculatePrice = (comm: number, fee: number, ship: number) => {
        const totalFixed = cost + fee + fExt + ship;
        const totalVarPercent = comm + vTax + vAds + vMargin;
        const denominator = 1 - totalVarPercent;
        return denominator > 0 ? totalFixed / denominator : totalFixed * 2;
      };

      let sellingPrice = calculatePrice(vComm, fChan, fShip);

      // Mercado Livre Rules
      if (channel.id.startsWith('ml_')) {
        if (sellingPrice >= 79) {
          // Over 79: No fixed fee, but add shipping cost
          sellingPrice = calculatePrice(vComm, 0, fShip);
          fChan = 0;
        } else {
          // Under 79: Fixed fee, no shipping cost (usually)
          sellingPrice = calculatePrice(vComm, 6.00, 0);
          fChan = 6.00;
          fShip = 0;
        }
      }

      // Shopee Rules
      if (channel.id === 'shopee') {
        // First pass to determine bracket
        if (sellingPrice < 80) {
          vComm = 0.20;
          fChan = 4.00;
        } else {
          vComm = 0.14;
          if (sellingPrice <= 99) {
            fChan = 16.00;
          } else {
            fChan = 16.00; // Assuming 16 for above 99 as well based on user prompt
          }
        }
        sellingPrice = calculatePrice(vComm, fChan, fShip);
      }

      const commissionAmount = sellingPrice * vComm;
      const taxes = sellingPrice * vTax;
      const adsAmount = sellingPrice * vAds;
      const fees = commissionAmount + fChan + fShip;
      const marginAmount = sellingPrice - cost - fees - taxes - adsAmount - fExt;

      results[channel.id] = {
        sellingPrice,
        marginAmount,
        marginPercent: vMargin * 100,
        fees,
        taxes,
        adsAmount,
        extraFixedAmount: fExt,
        shippingAmount: fShip,
      };
    });

    return {
      sku: product.sku,
      cost: product.cost,
      channels: results,
    };
  });
}
