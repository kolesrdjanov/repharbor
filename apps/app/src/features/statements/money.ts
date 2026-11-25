import { RequestError } from '@/api/client';

function moneyFormat(currency: string) {
  return Intl.NumberFormat('en-IE', { style: 'currency', currency });
}

export function formatMoney(minor: string, currency: string) {
  const format = moneyFormat(currency);
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
  const value = BigInt(minor);
  const divisor = 10n ** BigInt(digits);
  const whole = value / divisor;
  const fraction = (value < 0n ? -value : value) % divisor;
  return format.formatToParts(value < 0n && whole === 0n ? -0 : whole)
    .map((part) => part.type === 'fraction' ? fraction.toString().padStart(digits, '0') : part.value)
    .join('');
}

export function parseMoney(input: string, currency: string, allowSigned = false) {
  if (!/^[A-Z]{3}$/.test(currency)) throw new RequestError(400, 'CURRENCY_INVALID', 'Enter a three-letter currency code.');
  const digits = moneyFormat(currency).resolvedOptions().maximumFractionDigits ?? 2;
  if (!/^-?\d+(?:\.\d+)?$/.test(input) || (!allowSigned && input.startsWith('-'))) {
    throw new RequestError(400, 'AMOUNT_INVALID', 'Enter an amount in the selected currency.');
  }
  const [whole, decimal = ''] = input.replace(/^-/, '').split('.');
  if (decimal.length > digits) throw new RequestError(400, 'AMOUNT_PRECISION', `This currency allows ${digits} decimal places.`);
  const amount = BigInt(whole) * 10n ** BigInt(digits) + BigInt(decimal.padEnd(digits, '0') || '0');
  if (!allowSigned && amount === 0n) throw new RequestError(400, 'AMOUNT_REQUIRED', 'Enter an amount greater than zero.');
  return (input.startsWith('-') ? -amount : amount).toString();
}
