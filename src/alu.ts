import { Cpu } from "./cpu"

export const parity = (value: number): boolean => {
    let parity = 0;
    while(value) {
        parity ^= value & 1;
        value >>>= 1;
    }
    return parity === 0;
}

export const daa = (cpu: Cpu) => {
    const a = cpu.a;

    if ((a & 0xf) > 9 || cpu.flags.h) {
        cpu.a = cpu.flags.n ? cpu.a - 0x06 : cpu.a + 0x06;
    }
    if (a > 0x99 || cpu.flags.c) {
        cpu.a = cpu.flags.n ? cpu.a - 0x60 : cpu.a + 0x60;
    }

    if (cpu.flags.n) {
        cpu.flags.h = cpu.flags.h && (a & 0xf) <= 0x5;
    }
    else {
        cpu.flags.h = (a & 0xf) >= 0xa;
    }
    cpu.flags.c = cpu.flags.c || (a > 0x99);
    cpu.flags.s = !!(cpu.a & 0x80);
    cpu.flags.z = cpu.a === 0;
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
    const c = +cpu.flags.c
    const result = x + y + c;
    cpu.flags.s = !!(result & 0x8000);
    cpu.flags.z = !(result & 0xffff);
    cpu.flags.h = !!(((x & 0x0fff) + (y & 0x0fff) + c) & 0x1000);
    if ((x & 0x8000) !== (y & 0x8000)) cpu.flags.pv = false;
    else cpu.flags.pv = (x & 0x8000) !== (result & 0x8000);
    cpu.flags.n = false;
    cpu.flags.c = !!(result & 0x10000);
    return result & 0xffff;
}

export const sbc16 = (cpu: Cpu, x: number, y: number) => {
    const c = +cpu.flags.c
    const result = x - y - c;
    cpu.flags.s = !!(result & 0x8000);
    cpu.flags.z = !(result & 0xffff);
    cpu.flags.h = !!(((x & 0xfff) - (y & 0xfff) - c) & 0x1000);
    if ((x & 0x8000) === (y & 0x8000)) cpu.flags.pv = false;
    else cpu.flags.pv = (x & 0x8000) !== (result & 0x8000);
    cpu.flags.n = true;
    cpu.flags.c = !!(result & 0x10000);
    return result & 0xffff;
}

export const inc8 = (cpu: Cpu, value: number) => {
    const result = value + 1;
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !(result & 0xff);
    cpu.flags.h = !!(((value & 0x0f) + 1) & 0x10);
    cpu.flags.pv = value === 0x7f;
    cpu.flags.n = false;
    return result;
}

export const dec8 = (cpu: Cpu, value: number) => {
    const result = value - 1;
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !(result & 0xff);
    cpu.flags.h = !!(((value & 0x0f) - 1) & 0x10);
    cpu.flags.pv = value === 0x80;
    cpu.flags.n = true;
    return result;
}

export const io_in = (cpu: Cpu, port: number): number => {
    const result = cpu.bus.in(port);
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !(result & 0xff);
    cpu.flags.pv = parity(result);
    cpu.flags.h = false;
    cpu.flags.n = false;
    return result;
}

export const rlc = (cpu: Cpu, value: number) => {
    const msb = value >>> 7;
    const result = ((value << 1) | msb) & 0xff;
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !result;
    cpu.flags.h = false;
    cpu.flags.pv = parity(result);
    cpu.flags.n = false;
    cpu.flags.c = !!msb;
    return result;
}
rlc.iname = 'rlc';

export const rrc = (cpu: Cpu, value: number) => {
    const lsb = value & 1;
    const result = (value >>> 1) | (lsb << 7);
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !result;
    cpu.flags.h = false;
    cpu.flags.pv = parity(result);
    cpu.flags.n = false;
    cpu.flags.c = !!lsb;
    return result;
}
rrc.iname = 'rrc';


export const rl = (cpu: Cpu, value: number) => {
    const msb = value >>> 7;
    const result = ((value << 1) | (+cpu.flags.c)) & 0xff;
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !result;
    cpu.flags.h = false;
    cpu.flags.pv = parity(result);
    cpu.flags.n = false;
    cpu.flags.c = !!msb;
    return result;
}
rl.iname = 'rl';

export const rr = (cpu: Cpu, value: number) => {
    const lsb = value & 1;
    const result = (+cpu.flags.c << 7) | (value >>> 1);
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !result;
    cpu.flags.h = false;
    cpu.flags.pv = parity(result);
    cpu.flags.n = false;
    cpu.flags.c = !!lsb;
    return result;
}
rr.iname = 'rr';

export const sla = (cpu: Cpu, value: number) => {
    const msb = value >>> 7;
    const result = (value << 1) & 0xff;
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !result;
    cpu.flags.h = false;
    cpu.flags.pv = parity(result);
    cpu.flags.n = false;
    cpu.flags.c = !!msb;
    return result;
}
sla.iname = 'sla';

export const sra = (cpu: Cpu, value: number) => {
    const lsb = value & 1;
    const result = (value & 0x80) | (value >> 1);
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !result;
    cpu.flags.pv = parity(result);
    cpu.flags.h = false;
    cpu.flags.n = false;
    cpu.flags.c = !!lsb;
    return result;
}
sra.iname = 'sra';

export const sll = (cpu: Cpu, value: number) => {
    const msb = value >>> 7;
    const result = ((value << 1) | 1) & 0xff;
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !result;
    cpu.flags.h = false;
    cpu.flags.pv = parity(result);
    cpu.flags.n = false;
    cpu.flags.c = !!msb;
    return result;
}
sll.iname = 'sll';

export const srl = (cpu: Cpu, value: number) => {
    const lsb = value & 1;
    const result = value >>> 1;
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !result;
    cpu.flags.h = false;
    cpu.flags.pv = parity(result);
    cpu.flags.n = false;
    cpu.flags.c = !!lsb;
    return result;
}
srl.iname = 'srl';

export const ldi = (cpu: Cpu) => {
    cpu.bus.write8(cpu.de, cpu.bus.read8(cpu.hl));
    cpu.de++;
    cpu.hl++;
    cpu.bc--;
    cpu.flags.h = false;
    cpu.flags.pv = cpu.bc !== 0;
    cpu.flags.n = false;
}
ldi.iname = 'ldi';

export const ldd = (cpu: Cpu) => {
    cpu.bus.write8(cpu.de, cpu.bus.read8(cpu.hl));
    cpu.de--;
    cpu.hl--;
    cpu.bc--;
    cpu.flags.h = false;
    cpu.flags.pv = cpu.bc !== 0;
    cpu.flags.n = false;
}
ldd.iname = 'ldd';

export const ldir = (cpu: Cpu) => {
    const value = cpu.bus.read8(cpu.hl);
    cpu.bus.write8(cpu.de, value);
    cpu.de++;
    cpu.hl++;
    cpu.bc--;
    // cpu.flags.h = false;
    // cpu.flags.pv = false;
    // cpu.flags.pv = false;
    cpu.flags.n = false;
    cpu.flags.h = false;
    // cpu.flags.z = cpu.b === 0;
    // cpu.flags.s = true;
    // cpu.flags.h = true;
    // cpu.flags.c = true;
    cpu.flags.pv = !!(cpu.bc);

    if (cpu.bc > 0) {
        cpu.pc -= 2;
        return false;
    } 
    return true;
}
ldir.iname = 'ldir';

export const lddr = (cpu: Cpu) => {
    cpu.bus.write8(cpu.de, cpu.bus.read8(cpu.hl));
    cpu.de--;
    cpu.hl--;
    cpu.bc--;
    cpu.flags.h = false;
    cpu.flags.pv = cpu.bc !== 0;
    cpu.flags.n = false;
    if (cpu.bc > 0) {
        cpu.pc -= 2;
        return false;
    } 
    return true;
}
lddr.iname = 'lddr';

export const cpi = (cpu: Cpu) => {
    const tmp = cpu.flags.c;
    cpAcc(cpu, cpu.bus.read8(cpu.hl));
    cpu.hl++;
    cpu.bc--;
    cpu.flags.pv = cpu.bc !== 0;
    cpu.flags.c = tmp;
}
cpi.iname = 'cpi';

export const cpd = (cpu: Cpu) => {
    const tmp = cpu.flags.c;
    cpAcc(cpu, cpu.bus.read8(cpu.hl));
    cpu.hl--;
    cpu.bc--;
    cpu.flags.pv = cpu.bc !== 0;
    cpu.flags.c = tmp;
}
cpd.iname = 'cpd'

export const cpir = (cpu: Cpu) => {
    const tmp = cpu.flags.c;
    cpAcc(cpu, cpu.bus.read8(cpu.hl));
    cpu.hl++;
    cpu.bc--;
    cpu.flags.pv = cpu.bc !== 0;
    cpu.flags.c = tmp;
    if (cpu.bc === 0 || cpu.flags.z) {
        return true;
    }
    cpu.pc -= 2;
    return false;
}
cpir.iname = 'cpir';

export const cpdr = (cpu: Cpu) => {
    const tmp = cpu.flags.c;
    cpAcc(cpu, cpu.bus.read8(cpu.hl));
    cpu.hl--;
    cpu.bc--;
    cpu.flags.pv = cpu.bc !== 0;
    cpu.flags.c = tmp;
    if (cpu.bc === 0 || cpu.flags.z) {
        return true;
    }
    cpu.pc -= 2;
    return false;
}
cpdr.iname = 'cpdr'

export const ini = (cpu: Cpu) => {
    cpu.bus.write8(cpu.hl, cpu.bus.in(cpu.c));
    cpu.hl++;
    cpu.b--;
    cpu.flags.z = cpu.b === 0;
    cpu.flags.n = true;
}
ini.iname = 'ini';

export const ind = (cpu: Cpu) => {
    cpu.bus.write8(cpu.hl, cpu.bus.in(cpu.c));
    cpu.hl--;
    cpu.b--;
    cpu.flags.z = cpu.b === 0;
    cpu.flags.n = true;
}
ind.iname = 'ind';

export const inir = (cpu: Cpu) => {
    cpu.bus.write8(cpu.hl, cpu.bus.in(cpu.c));
    cpu.hl++;
    cpu.b--;
    cpu.flags.z = true;
    cpu.flags.n = true;
    if (cpu.b === 0) {
        return true;
    }
    cpu.pc -= 2;
    return false;
}
inir.iname = 'inir';

export const indr = (cpu: Cpu) => {
    cpu.bus.write8(cpu.hl, cpu.bus.in(cpu.c));
    cpu.hl--;
    cpu.b--;
    cpu.flags.z = true;
    cpu.flags.n = true;
    if (cpu.b === 0) {
        return true;
    }
    cpu.pc -= 2;
    return false;
}
indr.iname = 'indr';

export const outi = (cpu: Cpu) => {
    cpu.bus.out(cpu.c, cpu.bus.read8(cpu.hl));
    cpu.hl++;
    cpu.b--;
    cpu.flags.z = cpu.b === 0;
    cpu.flags.n = true;
}
outi.iname = 'outi';

export const outd = (cpu: Cpu) => {
    cpu.bus.out(cpu.c, cpu.bus.read8(cpu.hl));
    cpu.hl--;
    cpu.b--;
    cpu.flags.z = cpu.b === 0;
    cpu.flags.n = true;
}
outd.iname = 'outd';

export const otir = (cpu: Cpu) => {
    const value = cpu.bus.read8(cpu.hl)
    cpu.bus.out(cpu.c, value);
    cpu.hl++;
    cpu.b--;
    const k = value + cpu.l;
    // cpu.flags.c = k > 255;
    // cpu.flags.h = k > 255;
    // cpu.flags.pv = !parity(cpu.b);
    // cpu.flags.pv = parity((k & 7) ^ cpu.b);
    cpu.flags.pv = false;
    cpu.flags.n = !!(value & 0x80);
    cpu.flags.z = cpu.b === 0;
    if (cpu.b === 0) {
        return true;
    }
    cpu.pc -= 2;
    return false;
}
otir.iname = 'otir';

export const otdr = (cpu: Cpu) => {
    cpu.bus.out(cpu.c, cpu.bus.read8(cpu.hl));
    cpu.hl--;
    cpu.b--;
    cpu.flags.z = true;
    cpu.flags.n = true;
    if (cpu.b === 0) {
        return true;
    }
    cpu.pc -= 2;
    return false;
}
otdr.iname = 'otdr';

export const addAcc = (cpu: Cpu, value: number) => {
    let result = cpu.a + value;
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !(result & 0xff);
    cpu.flags.h = !!(((cpu.a & 0x0f) + (value & 0x0f)) & 0x10);
    if ((cpu.a & 0x80) !== (value & 0x80)) cpu.flags.pv = false;
    else cpu.flags.pv = (result & 0x80) !== (cpu.a & 0x80);
    cpu.flags.n = false;
    cpu.flags.c = !!(result & 0x100);
    cpu.a = result;
}
addAcc.iname = 'add';

export const adcAcc = (cpu: Cpu, value: number) => {
    const c = +cpu.flags.c;
    let result = cpu.a + value + c;
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !(result & 0xff);
    cpu.flags.h = !!(((cpu.a & 0x0f) + (value & 0x0f) + c) & 0x10);
    if ((cpu.a & 0x80) !== (value & 0x80)) cpu.flags.pv = false;
    else cpu.flags.pv = (result & 0x80) !== (cpu.a & 0x80);
    cpu.flags.n = false;
    cpu.flags.c = !!(result & 0x100);
    cpu.a = result;
}
adcAcc.iname = 'adc';

export const subAcc = (cpu: Cpu, value: number, carry?: boolean) => {
    let result = cpu.a - value;
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !(result & 0xff);
    cpu.flags.h = !!(((cpu.a & 0x0f) - (value & 0x0f)) & 0x10);
    if ((cpu.a & 0x80) === (value & 0x80)) cpu.flags.pv = false;
    else cpu.flags.pv = (result & 0x80) !== (cpu.a & 0x80);
    cpu.flags.n = true;
    cpu.flags.c = !!(result & 0x100);
    cpu.a = result;
}
subAcc.iname = 'sub';

export const sbcAcc = (cpu: Cpu, value: number) => {
    const c = +cpu.flags.c;
    let result = cpu.a - value - c;
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !(result & 0xff);
    cpu.flags.h = !!(((cpu.a & 0x0f) - (value & 0x0f) - c) & 0x10);
    if ((cpu.a & 0x80) === (value & 0x80)) cpu.flags.pv = false;
    else cpu.flags.pv = (result & 0x80) !== (cpu.a & 0x80);
    cpu.flags.n = true;
    cpu.flags.c = !!(result & 0x100);
    cpu.a = result;
}
sbcAcc.iname = 'sbc';

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
andAcc.iname = 'and';

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
xorAcc.iname = 'xor';

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
orAcc.iname = 'or';

export const cpAcc = (cpu: Cpu, value: number) => {
    const tmp = cpu.a;
    subAcc(cpu, value);
    cpu.a = tmp;
}
cpAcc.iname = 'cp';
