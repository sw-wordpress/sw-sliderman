/** Byte length of PHP's ASCII CanonicalJson encoding, including its safe string escapes. */
export function canonicalBytes(value: unknown): number {
  const json = JSON.stringify(value);
  if (json === undefined) throw new Error('Value is not JSON');
  let bytes = 0;
  for (let index = 0; index < json.length; index++) {
    const char = json[index];
    if (char === '\\') {
      const next = json[++index];
      bytes += next === '\\' || next === '"' ? 6 : 2;
    } else {
      bytes += json.charCodeAt(index) >= 128 || "<>&'".includes(char ?? '') ? 6 : 1;
    }
  }
  return bytes + numericDifference(value);
}

/** PHP emits scientific notation below 1e-4; JS starts below 1e-6. */
function numericDifference(value: unknown): number {
  if (typeof value === 'number' && value !== 0 && Math.abs(value) < 0.0001) {
    const [mantissa = '', exponent = ''] = value.toExponential().split('e');
    const php = `${mantissa.includes('.') ? mantissa : `${mantissa}.0`}e${exponent}`;
    return php.length - JSON.stringify(value).length;
  }
  if (Array.isArray(value))
    return value.reduce<number>((sum, item) => sum + numericDifference(item), 0);
  if (typeof value === 'object' && value !== null)
    return Object.values(value).reduce<number>((sum, item) => sum + numericDifference(item), 0);
  return 0;
}
