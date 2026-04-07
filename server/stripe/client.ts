import Stripe from "stripe";
import { ENV } from "../_core/env";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeClient) {
    if (!ENV.stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    stripeClient = new Stripe(ENV.stripeSecretKey, {
      apiVersion: "2025-03-31.basil",
    });
  }
  return stripeClient;
}
