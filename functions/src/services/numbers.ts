/**
 * Safe numeric handling for token weights represented as raw strings (wei-like units).
 */

export function toRawString(value: bigint | number): string {
    return value.toString();
}

export function addRaw(a: string, b: string): string {
    return (BigInt(a || '0') + BigInt(b || '0')).toString();
}

export function subRaw(a: string, b: string): string {
    const res = BigInt(a || '0') - BigInt(b || '0');
    return (res < 0n ? 0n : res).toString();
}

export function compareRaw(a: string, b: string): number {
    const valA = BigInt(a || '0');
    const valB = BigInt(b || '0');
    if (valA > valB) return 1;
    if (valA < valB) return -1;
    return 0;
}
