import { ChannelConfig } from './types';

export const DEFAULT_CHANNELS: ChannelConfig[] = [
  {
    id: 'ml_classico',
    name: 'ML Clássico',
    commission: 0.12, // 12%
    fixedFee: 6.00,
    tax: 0.06,
    extraFixedCost: 0,
    shippingCost: 0,
    ads: 0,
    color: 'bg-yellow-400',
  },
  {
    id: 'ml_premium',
    name: 'ML Premium',
    commission: 0.17, // 17%
    fixedFee: 6.00,
    tax: 0.06,
    extraFixedCost: 0,
    shippingCost: 0,
    ads: 0,
    color: 'bg-yellow-500',
  },
  {
    id: 'shopee',
    name: 'Shopee',
    commission: 0.20, // Default 20%
    fixedFee: 4.00, // Default 4.00
    tax: 0.06,
    extraFixedCost: 0,
    ads: 0,
    color: 'bg-orange-500',
  },
  {
    id: 'tiktok_shop',
    name: 'TikTok Shop',
    commission: 0.05,
    fixedFee: 1.00,
    tax: 0.06,
    extraFixedCost: 0,
    ads: 0,
    color: 'bg-black',
  },
  {
    id: 'site_proprio',
    name: 'Site Próprio',
    commission: 0.03,
    fixedFee: 0.00,
    tax: 0.06,
    extraFixedCost: 0,
    ads: 0,
    color: 'bg-blue-600',
  },
];
