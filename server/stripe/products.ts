/**
 * Stripe 商品・価格定義
 * 献立日和〜coto coto〜 プレミアムプラン
 */

export const STRIPE_PRODUCTS = {
  premium: {
    priceId: "price_1TJUp1J5ha7C6H7xTkMuZvSK",
    name: "献立日和〜coto coto〜 プレミアムプラン",
    amount: 480,
    currency: "jpy",
    interval: "month" as const,
  },
} as const;
