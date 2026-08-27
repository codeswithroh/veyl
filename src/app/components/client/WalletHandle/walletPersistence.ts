"use client";

// Remembers which wallet (by wallet-standard name, e.g. "Ready") the user last
// connected, so a page refresh can silently re-establish the session instead of
// forcing a fresh Connect click. Cleared on explicit disconnect.
const STORAGE_KEY = "veyl-connected-wallet";

export function rememberWallet(name: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, name);
  } catch {
    /* localStorage unavailable (private mode, etc.) - just skip persistence */
  }
}

export function forgetWallet(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getRememberedWallet(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
