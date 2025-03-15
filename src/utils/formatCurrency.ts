/**
 * Format a number as Nigerian Naira (₦) with commas as thousand separators.
 * @param amount - The amount to format.
 * @returns The formatted currency string (e.g., "₦500,000").
 */
export function formatCurrency(amount: number): string {
  return `₦${amount.toLocaleString('en-US')}`;
}
