import { Cpu } from "./cpu"

const parity = (value: number): boolean => {
    let parity = 0;
    while(value) {
        parity ^= value & 1;
        value >>>= 1;
    }
    return parity == 0;
}

export const daa = (cpu: Cpu) => {
    if ((cpu.a & 0xf) > 9 || cpu.flags.h) {
        cpu.a = cpu.flags.n ? cpu.a - 0x06 : cpu.a + 0x06;
    }
    if (((cpu.a & 0xf0) >>> 4) > 9 || cpu.flags.c) {
        cpu.a = cpu.flags.n ? cpu.a - 0x60 : cpu.a + 0x60;
    }

    if (cpu.flags.n) {
        cpu.flags.h = cpu.flags.h && (cpu.a & 0xf) <= 0x5;
    }
    else {
        cpu.flags.h = (cpu.a & 0xf) >= 0xa;
    }
    cpu.flags.c = cpu.flags.c || (cpu.a > 0x99);
    
    cpu.flags.s = !!(cpu.a & 0x80);
    cpu.flags.z = !(cpu.a & 0xff);
    cpu.flags.pv = parity(cpu.a);
}

export const add16 = (cpu: Cpu, x: number, y: number) => {
    const result = x + y;
    cpu.flags.h = !!(((x & 0x0fff) + (y & 0x0fff)) & 0x1000);
    cpu.flags.n = false;
    cpu.flags.c = !!(result & 0x10000);
    return result & 0xffff;
}

export const adc16 = (cpu: Cpu, x: number, y: number) => {
    return add16(cpu, x + +cpu.flags.c, y);
}

export const sbc16 = (cpu: Cpu, x: number, y: number) => {
    const result = x - y;
    cpu.flags.s = !!(result & 0x8000);
    cpu.flags.z = !(result & 0xffff);
    cpu.flags.h = !!(((x & 0x0fff) - (y & 0x0fff)) & 0x1000);
    if ((x & 0x8000) && (y & 0x8000)) cpu.flags.pv = false;
    else cpu.flags.pv = (x & 0x8000) != (result & 0x8000);
    cpu.flags.n = true;
    cpu.flags.c = !!(result & 0x10000);
    return result & 0xffff;
}

export const inc8 = (cpu: Cpu, value: number) => {
    const result = value + 1;
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !(result & 0xff);
    cpu.flags.h = !!(((value & 0x0f) + 1) & 0x10);
    cpu.flags.pv = value == 0x7f;
    cpu.flags.n = false;
    return result;
}

export const dec8 = (cpu: Cpu, value: number) => {
    const result = value - 1;
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !(result & 0xff);
    cpu.flags.h = !!(((value & 0x0f) - 1) & 0x10);
    cpu.flags.pv = value == 0x80;
    cpu.flags.n = true;
    return result;
}

export const io_in = (cpu: Cpu, port: number): number => {
    const result = cpu.memory.in(port);
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !(result & 0xff);
    cpu.flags.pv = parity(result);
    cpu.flags.h = false;
    cpu.flags.n = false;
    return result;
}

export const rlc = (cpu: Cpu, value: number) => {
    const msb = value >>> 7;
    const result = (value << 1) | msb;
    cpu.flags.h = false;
    cpu.flags.n = false;
    cpu.flags.c = !!msb;
    return result;
}
rlc.fname = 'rlc';

export const rrc = (cpu: Cpu, value: number) => {
    const lsb = value & 1;
    const result = (value >>> 1) | (lsb << 7);
    cpu.flags.h = false;
    cpu.flags.n = false;
    cpu.flags.c = !!lsb;
    return result;
}
rrc.fname = 'rrc';


export const rl = (cpu: Cpu, value: number) => {
    const msb = value >>> 7;
    const result = (value << 1) | (+cpu.flags.c);
    cpu.flags.h = false;
    cpu.flags.n = false;
    cpu.flags.c = !!msb;
    return result;
}
rl.fname = 'rl';

export const rr = (cpu: Cpu, value: number) => {
    const lsb = value & 1;
    const result = (value >>> 1) | (+cpu.flags.c);
    cpu.flags.h = false;
    cpu.flags.n = false;
    cpu.flags.c = !!lsb;
    return result;
}
rr.fname = 'rr';

export const sla = (cpu: Cpu, value: number) => {
    const msb = value >>> 7;
    const result = value << 1;
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !(result & 0xff);
    cpu.flags.pv = parity(result);
    cpu.flags.h = false;
    cpu.flags.n = false;
    cpu.flags.c = !!msb;
    return result;
}
sla.fname = 'sla';

export const sra = (cpu: Cpu, value: number) => {
    const lsb = value & 1;
    const result = value >> 1;
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !(result & 0xff);
    cpu.flags.pv = parity(result);
    cpu.flags.h = false;
    cpu.flags.n = false;
    cpu.flags.c = !!lsb;
    return result;
}
sra.fname = 'sra';

export const sll = (cpu: Cpu, value: number) => {
    const msb = value >>> 7;
    const result = (value << 1) | 1;
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !(result & 0xff);
    cpu.flags.pv = parity(result);
    cpu.flags.h = false;
    cpu.flags.n = false;
    cpu.flags.c = !!msb;
    return result;
}
sll.fname = 'sll';

export const srl = (cpu: Cpu, value: number) => {
    const lsb = value & 1;
    const result = value >>> 1;
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !(result & 0xff);
    cpu.flags.pv = parity(result);
    cpu.flags.h = false;
    cpu.flags.n = false;
    cpu.flags.c = !!lsb;
    return result;
}
srl.fname = 'srl';

export const ldi = (cpu: Cpu) => {
    cpu.memory.write16(cpu.de, cpu.memory.read16(cpu.hl));
    cpu.de++;
    cpu.hl++;
    cpu.bc--;
    cpu.flags.h = false;
    cpu.flags.pv = cpu.bc == 0;
    cpu.flags.n = false;
}
ldi.fname = 'ldi';

export const ldd = (cpu: Cpu) => {
    cpu.memory.write16(cpu.de, cpu.memory.read16(cpu.hl));
    cpu.de--;
    cpu.hl--;
    cpu.bc--;
    cpu.flags.h = false;
    cpu.flags.pv = cpu.bc == 0;
    cpu.flags.n = false;
}
ldd.fname = 'ldd';

export const ldir = (cpu: Cpu) => {
    cpu.memory.write16(cpu.de, cpu.memory.read16(cpu.hl));
    cpu.de++;
    cpu.hl++;
    cpu.bc--;
    cpu.flags.h = false;
    cpu.flags.pv = false;
    cpu.flags.n = false;
    if (cpu.bc > 0) {
        cpu.pc -= 2;
        return false;
    } 
    return true;
}
ldir.fname = 'ldir';

export const lddr = (cpu: Cpu) => {
    cpu.memory.write16(cpu.de, cpu.memory.read16(cpu.hl));
    cpu.de--;
    cpu.hl--;
    cpu.bc--;
    cpu.flags.h = false;
    cpu.flags.pv = false;
    cpu.flags.n = false;
    if (cpu.bc > 0) {
        cpu.pc -= 2;
        return false;
    } 
    return true;
}
lddr.fname = 'lddr';

export const cpi = (cpu: Cpu) => {
    const tmp = cpu.flags.c;
    cpAcc(cpu, cpu.memory.read8(cpu.hl));
    cpu.hl++;
    cpu.bc--;
    cpu.flags.pv = cpu.bc == 0;
    cpu.flags.c = tmp;
}
cpi.fname = 'cpi';

export const cpd = (cpu: Cpu) => {
    const tmp = cpu.flags.c;
    cpAcc(cpu, cpu.memory.read8(cpu.hl));
    cpu.hl--;
    cpu.bc--;
    cpu.flags.pv = cpu.bc == 0;
    cpu.flags.c = tmp;
}
cpd.fname = 'cpd'

export const cpir = (cpu: Cpu) => {
    const tmp = cpu.flags.c;
    cpAcc(cpu, cpu.memory.read8(cpu.hl));
    cpu.hl++;
    cpu.bc--;
    cpu.flags.pv = cpu.bc != 0;
    cpu.flags.c = tmp;
    if (cpu.bc == 0 || cpu.flags.z) {
        return true;
    }
    cpu.pc -= 2;
    return false;
}
cpir.fname = 'cpir';

export const cpdr = (cpu: Cpu) => {
    const tmp = cpu.flags.c;
    cpAcc(cpu, cpu.memory.read8(cpu.hl));
    cpu.hl++;
    cpu.bc--;
    cpu.flags.pv = cpu.bc != 0;
    cpu.flags.c = tmp;
    if (cpu.bc == 0 || cpu.flags.z) {
        return true;
    }
    cpu.pc -= 2;
    return false;
}
cpdr.fname = 'cpdr'

export const ini = (cpu: Cpu) => {
    cpu.memory.write8(cpu.hl, cpu.memory.in(cpu.c));
    cpu.hl++;
    cpu.b--;
    cpu.flags.z = cpu.b == 0;
    cpu.flags.n = true;
}
ini.fname = 'ini';

export const ind = (cpu: Cpu) => {
    cpu.memory.write8(cpu.hl, cpu.memory.in(cpu.c));
    cpu.hl--;
    cpu.b--;
    cpu.flags.z = cpu.b == 0;
    cpu.flags.n = true;
}
ind.fname = 'ind';


export const inir = (cpu: Cpu) => {
    cpu.memory.write8(cpu.hl, cpu.memory.in(cpu.c));
    cpu.hl++;
    cpu.b--;
    cpu.flags.z = true;
    cpu.flags.n = true;
    if (cpu.b == 0) {
        return true;
    }
    cpu.pc -= 2;
    return false;
}
inir.fname = 'inir';

export const indr = (cpu: Cpu) => {
    cpu.memory.write8(cpu.hl, cpu.memory.in(cpu.c));
    cpu.hl--;
    cpu.b--;
    cpu.flags.z = true;
    cpu.flags.n = true;
    if (cpu.b == 0) {
        return true;
    }
    cpu.pc -= 2;
    return false;
}
indr.fname = 'indr';

export const outi = (cpu: Cpu) => {
    cpu.memory.out(cpu.c, cpu.memory.read8(cpu.hl));
    cpu.hl++;
    cpu.b--;
    cpu.flags.z = cpu.b == 0;
    cpu.flags.n = true;
}
outi.fname = 'outi';

export const outd = (cpu: Cpu) => {
    cpu.memory.out(cpu.c, cpu.memory.read8(cpu.hl));
    cpu.hl--;
    cpu.b--;
    cpu.flags.z = cpu.b == 0;
    cpu.flags.n = true;
}
outd.fname = 'outd';

export const otir = (cpu: Cpu) => {
    cpu.memory.out(cpu.c, cpu.memory.read8(cpu.hl));
    cpu.hl++;
    cpu.b--;
    cpu.flags.z = true;
    cpu.flags.n = true;
    if (cpu.b == 0) {
        return true;
    }
    cpu.pc -= 2;
    return false;
}
otir.fname = 'otir';

export const otdr = (cpu: Cpu) => {
    cpu.memory.out(cpu.c, cpu.memory.read8(cpu.hl));
    cpu.hl--;
    cpu.b--;
    cpu.flags.z = true;
    cpu.flags.n = true;
    if (cpu.b == 0) {
        return true;
    }
    cpu.pc -= 2;
    return false;
}
otdr.fname = 'otdr';

export const addAcc = (cpu: Cpu, value: number) => {
    const result = cpu.a + value;
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !(result & 0xff);
    cpu.flags.h = !!(((cpu.a & 0x0f) + (value & 0x0f)) & 0x10);
    if ((cpu.a & 0x80) !== (value & 0x80)) cpu.flags.pv = false;
    else cpu.flags.pv = (result & 0x80) != (cpu.a & 0x80);
    cpu.flags.n = false;
    cpu.flags.c = !!(result & 0x100);
    cpu.a = result;
}
addAcc.fname = 'add';

export const adcAcc = (cpu: Cpu, value: number) => {
    addAcc(cpu, value + +cpu.flags.c);
}
adcAcc.fname = 'adc';

export const subAcc = (cpu: Cpu, value: number) => {
    const a = cpu.a;
    const result = a - value;
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !(result & 0xff);
    cpu.flags.h = !!(((cpu.a & 0x0f) - (value & 0x0f)) & 0x10);
    if ((cpu.a & 0x80) === (value & 0x80)) cpu.flags.pv = false;
    else cpu.flags.pv = (result & 0x80) != (cpu.a & 0x80);
    cpu.flags.n = true;
    cpu.flags.c = !!(result & 0x100);
    cpu.a = result;
}
subAcc.fname = 'sub';

export const sbcAcc = (cpu: Cpu, value: number) => {
    subAcc(cpu, value + +cpu.flags.c);
}
sbcAcc.fname = 'sbc';

export const andAcc = (cpu: Cpu, value: number) => {
    const result = cpu.a & value;
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !(result & 0xff);
    cpu.flags.h = true;
    cpu.flags.pv = parity(result);
    cpu.flags.n = false;
    cpu.flags.c = false;
    cpu.a = result;
}
andAcc.fname = 'and';

export const xorAcc = (cpu: Cpu, value: number) => {
    const result = cpu.a ^ value;
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !(result & 0xff);
    cpu.flags.h = false;
    cpu.flags.pv = parity(result);
    cpu.flags.n = false;
    cpu.flags.c = false;
    cpu.a = result;
}
xorAcc.fname = 'xor';

export const orAcc = (cpu: Cpu, value: number) => {
    const result = cpu.a | value;
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !(result & 0xff);
    cpu.flags.h = false;
    cpu.flags.pv = parity(result);
    cpu.flags.n = false;
    cpu.flags.c = false;
    cpu.a = result;
}
orAcc.fname = 'or';

export const cpAcc = (cpu: Cpu, value: number) => {
    const tmp = cpu.a;
    subAcc(cpu, value);
    cpu.a = tmp;
}
cpAcc.fname = 'cp';

