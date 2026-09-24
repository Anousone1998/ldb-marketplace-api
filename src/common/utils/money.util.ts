/** Multiplies a 2-decimal amount by an integer quantity without floating point drift. */
export function multiplyMoney(amount: number, quantity: number): number {
  const cents = Math.round(amount * 100) * quantity;
  return cents / 100;
}
