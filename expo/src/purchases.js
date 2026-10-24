// src/purchases.js
//
// RevenueCat setup and helpers for Android (Google Play) subscriptions.
//
// RevenueCat's native module does not run in Expo Go, so everything here
// is wrapped to fail quietly there — the rest of the app keeps working.
// Real purchases need an EAS development build.

import { Platform } from "react-native";
import Purchases from "react-native-purchases";
import { getDeviceId } from "./storage";

// Public SDK key for the "doodlestories (Play Store)" app in RevenueCat
// (RevenueCat → API keys → starts with goog_). This key is meant to ship
// inside the app, so it's safe in code. NEVER put the sk_ secret key here.
const ANDROID_API_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || "goog_cGycphBzosMwkdlVrMhDVreEbhH";

// Must match the entitlement identifier in RevenueCat exactly.
export const ENTITLEMENT_ID = "doodlestories Premium";

let configured = false;

export function isPurchasesReady() {
  return configured;
}

// Call once when the app starts.
export async function initPurchases() {
  if (configured) return true;
  if (Platform.OS !== "android") return false; // iOS comes later
  if (!ANDROID_API_KEY.startsWith("goog_")) {
    console.warn("RevenueCat: Android API key is missing — purchases disabled.");
    return false;
  }
  try {
    // Use our own device ID as the RevenueCat user ID, so the server webhook
    // and the story limit check both refer to the same install.
    const appUserID = await getDeviceId();
    Purchases.configure({ apiKey: ANDROID_API_KEY, appUserID });
    configured = true;
    return true;
  } catch (err) {
    console.warn("RevenueCat setup skipped:", err?.message);
    return false;
  }
}

// The plans from the "default" offering in RevenueCat ($rc_monthly, $rc_annual).
// Returns [] if RevenueCat isn't available (e.g. in Expo Go).
export async function getPackages() {
  if (!configured) return [];
  const offerings = await Purchases.getOfferings();
  return offerings?.current?.availablePackages || [];
}

// Opens Google Play's purchase sheet for one plan.
// Returns "purchased", "cancelled", or throws on a real error.
export async function buyPackage(pkg) {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return customerInfo?.entitlements?.active?.[ENTITLEMENT_ID] ? "purchased" : "pending";
  } catch (err) {
    if (err?.userCancelled) return "cancelled";
    throw err;
  }
}

// Re-links an existing Google Play subscription to this install
// (new phone, reinstall). Returns true if premium is now active.
export async function restorePurchases() {
  if (!configured) return false;
  const info = await Purchases.restorePurchases();
  return !!info?.entitlements?.active?.[ENTITLEMENT_ID];
}

// True if this install currently has an active subscription.
export async function hasPremium() {
  if (!configured) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return !!info?.entitlements?.active?.[ENTITLEMENT_ID];
  } catch {
    return false;
  }
}

// Calls onChange(true/false) whenever the subscription changes
// (purchase, renewal, expiry, restore). Returns a function to stop listening.
export function watchPremium(onChange) {
  if (!configured) return () => {};
  const listener = (info) => onChange(!!info?.entitlements?.active?.[ENTITLEMENT_ID]);
  try {
    Purchases.addCustomerInfoUpdateListener(listener);
  } catch {
    return () => {};
  }
  return () => {
    try {
      Purchases.removeCustomerInfoUpdateListener(listener);
    } catch {}
  };
}
