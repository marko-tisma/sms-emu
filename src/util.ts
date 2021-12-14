export const toHex = (value: number, padding?: number): string => {
    let result = value.toString(16);
    if(padding) result = result.padStart(padding);
    return result;
}

export const testBit = (bit: number, value: number): boolean => {
    return !!(value & (1 << bit));
}