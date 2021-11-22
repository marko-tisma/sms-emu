import { Cpu } from "./cpu";

const parity = (value: number): boolean  => {
    let parity = 0;
    while(value) {
        parity ^= value & 1;
        value >>>= 1;
    }
    return parity == 0;
}

export const daa = (cpu: Cpu)  => {
    if ((cpu.a & 0xf) > 9 || cpu.flag_h) {
        cpu.a = cpu.flag_n ? cpu.a - 0x06 : cpu.a + 0x06;
    }
    if (((cpu.a & 0xf0) >>> 4) > 9 || cpu.flag_c) {
        cpu.a = cpu.flag_n ? cpu.a - 0x60 : cpu.a + 0x60;
    }

    if (cpu.flag_n) {
        cpu.flag_h = cpu.flag_h && (cpu.a & 0xf) <= 0x5;
    }
    else {
        cpu.flag_h = (cpu.a & 0xf) >= 0xa;
    }
    cpu.flag_c = cpu.flag_c || (cpu.a > 0x99);
    
    cpu.flag_s = !!(cpu.a & 0x80);
    cpu.flag_z = !(cpu.a & 0xff);
    cpu.flag_pv = parity(cpu.a);
}

export const add16 = (cpu: Cpu, x: number, y: number)  => {
    const result = x + y;
    cpu.flag_h = !!(((x & 0x0fff) + (y & 0x0fff)) & 0x1000);
    cpu.flag_n = false;
    cpu.flag_c = !!(result & 0x10000);
    return result & 0xffff;
}

export const adc16 = (cpu: Cpu, x: number, y: number)  => {
    return add16(cpu, x + +cpu.flag_c, y);
}

export const sbc16 = (cpu: Cpu, x: number, y: number)  => {
    const result = x - y;
    cpu.flag_s = !!(result & 0x80);
    cpu.flag_z = !(result & 0xff);
    cpu.flag_h = !!(((x & 0x0fff) - (y & 0x0fff)) & 0x1000);
    if ((x & 0x8000) && (y & 0x8000)) cpu.flag_pv = false;
    else cpu.flag_pv = (x & 0x8000) != (result & 0x8000);
    cpu.flag_n = true;
    cpu.flag_c = !!(result & 0x10000);
    return result & 0xffff;
}

export const inc8 = (cpu: Cpu, value: number)  => {
    const result = value + 1;
    cpu.flag_s = !!(result & 0x80);
    cpu.flag_z = !(result & 0xff);
    cpu.flag_h = !!(((value & 0x0f) + 1) & 0x10);
    cpu.flag_pv = value == 0x7f;
    cpu.flag_n = false;
    return result;
}

export const dec8 = (cpu: Cpu, value: number)  => {
    const result = value - 1;
    cpu.flag_s = !!(result & 0x80);
    cpu.flag_z = !(result & 0xff);
    cpu.flag_h = !!(((value & 0x0f) - 1) & 0x10);
    cpu.flag_pv = value == 0x80;
    cpu.flag_n = true;
    return result;
}

export const in_p = (cpu: Cpu, port: number): number  => {
    const result = cpu.memory.in(port);
    cpu.flag_s = !!(result & 0x80);
    cpu.flag_z = !(result & 0xff);
    cpu.flag_pv = parity(result);
    cpu.flag_h = false;
    cpu.flag_n = false;
    return result;
}

export const rlc = (cpu: Cpu, value: number)  => {
    const msb = value >>> 7;
    const result = (value << 1) | msb;
    cpu.flag_h = false;
    cpu.flag_n = false;
    cpu.flag_c = !!msb;
    return result;
}

export const rrc = (cpu: Cpu, value: number)  => {
    const lsb = value & 1;
    const result = (value >>> 1) | (lsb << 7);
    cpu.flag_h = false;
    cpu.flag_n = false;
    cpu.flag_c = !!lsb;
    return result;
}


export const rl = (cpu: Cpu, value: number)  => {
    const msb = value >>> 7;
    const result = (value << 1) | (+cpu.flag_c);
    cpu.flag_h = false;
    cpu.flag_n = false;
    cpu.flag_c = !!msb;
    return result;
}


export const rr = (cpu: Cpu, value: number)  => {
    const lsb = value & 1;
    const result = (value >>> 1) | (+cpu.flag_c);
    cpu.flag_h = false;
    cpu.flag_n = false;
    cpu.flag_c = !!lsb;
    return result;
}


export const sla = (cpu: Cpu, value: number)  => {
    const msb = value >>> 7;
    const result = value << 1;
    cpu.flag_s = !!(result & 0x80);
    cpu.flag_z = !(result & 0xff);
    cpu.flag_pv = parity(result);
    cpu.flag_h = false;
    cpu.flag_n = false;
    cpu.flag_c = !!msb;
    return result;
}

export const sra = (cpu: Cpu, value: number)  => {
    const lsb = value & 1;
    const result = value >> 1;
    cpu.flag_s = !!(result & 0x80);
    cpu.flag_z = !(result & 0xff);
    cpu.flag_pv = parity(result);
    cpu.flag_h = false;
    cpu.flag_n = false;
    cpu.flag_c = !!lsb;
    return result;
}

export const sll = (cpu: Cpu, value: number)  => {
    const msb = value >>> 7;
    const result = (value << 1) | 1;
    cpu.flag_s = !!(result & 0x80);
    cpu.flag_z = !(result & 0xff);
    cpu.flag_pv = parity(result);
    cpu.flag_h = false;
    cpu.flag_n = false;
    cpu.flag_c = !!msb;
    return result;
}

export const srl = (cpu: Cpu, value: number)  => {
    const lsb = value & 1;
    const result = value >>> 1;
    cpu.flag_s = !!(result & 0x80);
    cpu.flag_z = !(result & 0xff);
    cpu.flag_pv = parity(result);
    cpu.flag_h = false;
    cpu.flag_n = false;
    cpu.flag_c = !!lsb;
    return result;
}

export const ldi = (cpu: Cpu)  => {
    cpu.memory.write16(cpu.de, cpu.memory.read16(cpu.hl));
    cpu.de++;
    cpu.hl++;
    cpu.bc--;
    cpu.flag_h = false;
    cpu.flag_pv = cpu.bc == 0;
    cpu.flag_n = false;
}

export const ldd = (cpu: Cpu)  => {
    cpu.memory.write16(cpu.de, cpu.memory.read16(cpu.hl));
    cpu.de--;
    cpu.hl--;
    cpu.bc--;
    cpu.flag_h = false;
    cpu.flag_pv = cpu.bc == 0;
    cpu.flag_n = false;
}

export const ldir = (cpu: Cpu)  => {
    cpu.memory.write16(cpu.de, cpu.memory.read16(cpu.hl));
    cpu.de++;
    cpu.hl++;
    cpu.bc--;
    cpu.flag_h = false;
    cpu.flag_pv = false;
    cpu.flag_n = false;
    if (cpu.bc > 0) {
        cpu.pc -= 2;
        return false;
    } 
    return true;
}

export const lddr = (cpu: Cpu)  => {
    cpu.memory.write16(cpu.de, cpu.memory.read16(cpu.hl));
    cpu.de--;
    cpu.hl--;
    cpu.bc--;
    cpu.flag_h = false;
    cpu.flag_pv = false;
    cpu.flag_n = false;
    if (cpu.bc > 0) {
        cpu.pc -= 2;
        return false;
    } 
    return true;
}

export const cpi = (cpu: Cpu)  => {
    const tmp = cpu.flag_c;
    cpAcc(cpu, cpu.memory.read8(cpu.hl));
    cpu.hl++;
    cpu.bc--;
    cpu.flag_pv = cpu.bc == 0;
    cpu.flag_c = tmp;
}

export const cpd = (cpu: Cpu)  => {
    const tmp = cpu.flag_c;
    cpAcc(cpu, cpu.memory.read8(cpu.hl));
    cpu.hl--;
    cpu.bc--;
    cpu.flag_pv = cpu.bc == 0;
    cpu.flag_c = tmp;
}

export const cpir = (cpu: Cpu)  => {
    const tmp = cpu.flag_c;
    cpAcc(cpu, cpu.memory.read8(cpu.hl));
    cpu.hl++;
    cpu.bc--;
    cpu.flag_pv = cpu.bc != 0;
    cpu.flag_c = tmp;
    if (cpu.bc == 0 || cpu.flag_z) {
        return true;
    }
    cpu.pc -= 2;
    return false;
}

export const cpdr = (cpu: Cpu)  => {
    const tmp = cpu.flag_c;
    cpAcc(cpu, cpu.memory.read8(cpu.hl));
    cpu.hl++;
    cpu.bc--;
    cpu.flag_pv = cpu.bc != 0;
    cpu.flag_c = tmp;
    if (cpu.bc == 0 || cpu.flag_z) {
        return true;
    }
    cpu.pc -= 2;
    return false;
}

export const ini = (cpu: Cpu)  => {
    cpu.memory.write8(cpu.hl, cpu.memory.in(cpu.c));
    cpu.hl++;
    cpu.b--;
    cpu.flag_z = cpu.b == 0;
    cpu.flag_n = true;
}

export const ind = (cpu: Cpu)  => {
    cpu.memory.write8(cpu.hl, cpu.memory.in(cpu.c));
    cpu.hl--;
    cpu.b--;
    cpu.flag_z = cpu.b == 0;
    cpu.flag_n = true;
}


export const inir = (cpu: Cpu)  => {
    cpu.memory.write8(cpu.hl, cpu.memory.in(cpu.c));
    cpu.hl++;
    cpu.b--;
    cpu.flag_z = true;
    cpu.flag_n = true;
    if (cpu.b == 0) {
        return true;
    }
    cpu.pc -= 2;
    return false;
}

export const indr = (cpu: Cpu)  => {
    cpu.memory.write8(cpu.hl, cpu.memory.in(cpu.c));
    cpu.hl--;
    cpu.b--;
    cpu.flag_z = true;
    cpu.flag_n = true;
    if (cpu.b == 0) {
        return true;
    }
    cpu.pc -= 2;
    return false;
}

export const outi = (cpu: Cpu)  => {
    cpu.memory.out(cpu.c, cpu.memory.read8(cpu.hl));
    cpu.hl++;
    cpu.b--;
    cpu.flag_z = cpu.b == 0;
    cpu.flag_n = true;
}

export const outd = (cpu: Cpu)  => {
    cpu.memory.out(cpu.c, cpu.memory.read8(cpu.hl));
    cpu.hl--;
    cpu.b--;
    cpu.flag_z = cpu.b == 0;
    cpu.flag_n = true;
}


export const otir = (cpu: Cpu)  => {
    cpu.memory.out(cpu.c, cpu.memory.read8(cpu.hl));
    cpu.hl++;
    cpu.b--;
    cpu.flag_z = true;
    cpu.flag_n = true;
    if (cpu.b == 0) {
        return true;
    }
    cpu.pc -= 2;
    return false;
}

export const otdr = (cpu: Cpu)  => {
    cpu.memory.out(cpu.c, cpu.memory.read8(cpu.hl));
    cpu.hl--;
    cpu.b--;
    cpu.flag_z = true;
    cpu.flag_n = true;
    if (cpu.b == 0) {
        return true;
    }
    cpu.pc -= 2;
    return false;
}

export const addAcc = (cpu: Cpu, value: number)  => {
    const result = cpu.a + value;
    cpu.a = result;
    cpu.flag_s = !!(result & 0x80);
    cpu.flag_z = !(result & 0xff);
    cpu.flag_h = !!(((cpu.a & 0x0f) + (value & 0x0f)) & 0x10);
    if ((cpu.a & 0x80) != (value & 0x80)) cpu.flag_pv = false;
    else cpu.flag_pv = (result & 0x80) != (cpu.a & 0x80);
    cpu.flag_n = false;
    cpu.flag_c = !!(result & 0x100);
}

export const adcAcc = (cpu: Cpu, value: number)  => {
    addAcc(cpu, value + +cpu.flag_c);
}

export const subAcc = (cpu: Cpu, value: number)  => {
    const a = cpu.a;
    const result = a - value;
    cpu.a = result;
    cpu.flag_s = !!(result & 0x80);
    cpu.flag_z = !(result & 0xff);
    cpu.flag_h = !!(((cpu.a & 0x0f) - (value & 0x0f)) & 0x10);
    if ((cpu.a & 0x80) != (value & 0x80)) cpu.flag_pv = false;
    else cpu.flag_pv = (result & 0x80) != (cpu.a & 0x80);
    cpu.flag_n = true;
    cpu.flag_c = !!(result & 0x100);
}

export const sbcAcc = (cpu: Cpu, value: number)  => {
    subAcc(cpu, value + +cpu.flag_c);
}

export const andAcc = (cpu: Cpu, value: number)  => {
    const result = cpu.a & value;
    cpu.a = result;
    cpu.flag_s = !!(result & 0x80);
    cpu.flag_z = !(result & 0xff);
    cpu.flag_h = true;
    cpu.flag_pv = parity(result);
    cpu.flag_n = false;
    cpu.flag_c = false;

}

export const xorAcc = (cpu: Cpu, value: number)  => {
    const result = cpu.a ^ value;
    cpu.a = result;
    cpu.flag_s = !!(result & 0x80);
    cpu.flag_z = !(result & 0xff);
    cpu.flag_h = false;
    cpu.flag_pv = parity(result);
    cpu.flag_n = false;
    cpu.flag_c = false;
}

export const orAcc = (cpu: Cpu, value: number)  => {
    const result = cpu.a | value;
    cpu.a = result;
    cpu.flag_s = !!(result & 0x80);
    cpu.flag_z = !(result & 0xff);
    cpu.flag_h = false;
    cpu.flag_pv = parity(result);
    cpu.flag_n = false;
    cpu.flag_c = false;
}

export const cpAcc = (cpu: Cpu, value: number) => {
    const tmp = cpu.a;
    subAcc(cpu, value);
    cpu.a = tmp;
}

