import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | string): string {
  return new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(Number(value));
}

export function formatPercent(value: number | string): string {
  return `${Number(value).toFixed(1)}%`;
}

export function formatNumber(value: number | string): string {
  return new Intl.NumberFormat("nl-BE").format(Number(value));
}
