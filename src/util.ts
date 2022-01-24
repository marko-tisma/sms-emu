export const toHex = (value: number, padding?: number): string => {
    let result = value.toString(16);
    if (padding) result = result.padStart(padding, '0');
    return result;
}

export const testBit = (bit: number, value: number): boolean => {
    return !!(value & (1 << bit));
}

export const toSigned = (byte: number) => {
    return (byte << 24) >> 24;
}