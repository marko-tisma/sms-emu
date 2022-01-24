import { Cpu } from "./cpu"

export const parity = (value: number) => {
    let parity = 0;
    while (value) {
        parity ^= value & 1;
        value >>>= 1;
    }
    return parity === 0;
}

export const io_in = (cpu: Cpu, port: number): number => {
    const result = cpu.bus.in(port);
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !(result & 0xff);
    cpu.flags.h = false;
    cpu.flags.pv = parity(result);
    cpu.flags.n = false;
    return result;
}

export const bit_y = (cpu: Cpu, value: number, y: number) => {
    const mask = 1 << y;
    cpu.flags.z = !(mask & value);
    cpu.flags.s = y === 7 && (!cpu.flags.z);
    cpu.flags.pv = cpu.flags.z;
    cpu.flags.h = true;
    cpu.flags.n = false;
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
    return result & 0xff;
}

export const dec8 = (cpu: Cpu, value: number) => {
    const result = value - 1;
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !(result & 0xff);
    cpu.flags.h = !!(((value & 0x0f) - 1) & 0x10);
    cpu.flags.pv = value === 0x80;
    cpu.flags.n = true;
    return result & 0xff;
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
rlc.fname = 'rlc';

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
rrc.fname = 'rrc';

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
rl.fname = 'rl';

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
rr.fname = 'rr';

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
sla.fname = 'sla';

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
sra.fname = 'sra';

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
sll.fname = 'sll';

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
srl.fname = 'srl';

export const ldi = (cpu: Cpu) => {
    cpu.bus.write8(cpu.de, cpu.bus.read8(cpu.hl));
    cpu.de++;
    cpu.hl++;
    cpu.bc--;
    cpu.flags.h = false;
    cpu.flags.pv = cpu.bc !== 0;
    cpu.flags.n = false;
}
ldi.fname = 'ldi';

export const ldir = (cpu: Cpu) => {
    ldi(cpu);
    if (cpu.bc > 0) {
        cpu.pc -= 2;
        return false;
    }
    return true;
}
ldir.fname = 'ldir';

export const ldd = (cpu: Cpu) => {
    cpu.bus.write8(cpu.de, cpu.bus.read8(cpu.hl));
    cpu.de--;
    cpu.hl--;
    cpu.bc--;
    cpu.flags.h = false;
    cpu.flags.pv = cpu.bc !== 0;
    cpu.flags.n = false;
}
ldd.fname = 'ldd';

export const lddr = (cpu: Cpu) => {
    ldd(cpu);
    if (cpu.bc > 0) {
        cpu.pc -= 2;
        return false;
    }
    return true;
}
lddr.fname = 'lddr';

export const cpi = (cpu: Cpu) => {
    const tmp = cpu.flags.c;
    cpAcc(cpu, cpu.bus.read8(cpu.hl));
    cpu.hl++;
    cpu.bc--;
    cpu.flags.pv = cpu.bc !== 0;
    cpu.flags.c = tmp;
}
cpi.fname = 'cpi';

export const cpir = (cpu: Cpu) => {
    cpi(cpu);
    if (cpu.bc === 0 || cpu.flags.z) {
        return true;
    }
    cpu.pc -= 2;
    return false;
}
cpir.fname = 'cpir';

export const cpd = (cpu: Cpu) => {
    const tmp = cpu.flags.c;
    cpAcc(cpu, cpu.bus.read8(cpu.hl));
    cpu.hl--;
    cpu.bc--;
    cpu.flags.pv = cpu.bc !== 0;
    cpu.flags.c = tmp;
}
cpd.fname = 'cpd'

export const cpdr = (cpu: Cpu) => {
    cpd(cpu);
    if (cpu.bc === 0 || cpu.flags.z) {
        return true;
    }
    cpu.pc -= 2;
    return false;
}
cpdr.fname = 'cpdr'

export const ini = (cpu: Cpu) => {
    cpu.bus.write8(cpu.hl, cpu.bus.in(cpu.c));
    cpu.hl++;
    cpu.b--;
    // cpu.flags.s = !!(cpu.b & 0x80);
    cpu.flags.z = cpu.b === 0;
    cpu.flags.n = true;
}
ini.fname = 'ini';

export const inir = (cpu: Cpu) => {
    ini(cpu);
    cpu.flags.z = true;
    if (cpu.b === 0) {
        return true;
    }
    cpu.pc -= 2;
    return false;
}
inir.fname = 'inir';

export const ind = (cpu: Cpu) => {
    cpu.bus.write8(cpu.hl, cpu.bus.in(cpu.c));
    cpu.hl--;
    cpu.b--;
    cpu.flags.s = !!(cpu.b & 0x80);
    cpu.flags.z = cpu.b === 0;
    cpu.flags.n = true;
}
ind.fname = 'ind';

export const indr = (cpu: Cpu) => {
    ind(cpu);
    cpu.flags.z = true;
    if (cpu.b === 0) {
        return true;
    }
    cpu.pc -= 2;
    return false;
}
indr.fname = 'indr';

export const outi = (cpu: Cpu) => {
    cpu.bus.out(cpu.c, cpu.bus.read8(cpu.hl));
    cpu.hl++;
    cpu.b--;
    // cpu.flags.s = !!(cpu.b & 0x80);
    cpu.flags.z = cpu.b === 0;
    cpu.flags.n = true;
}
outi.fname = 'outi';

export const otir = (cpu: Cpu) => {
    outi(cpu);
    if (cpu.b === 0) {
        return true;
    }
    cpu.flags.pv = false;
    cpu.flags.n = !!(cpu.bus.read8(cpu.hl) & 0x80)
    cpu.pc -= 2;
    return false;
}
otir.fname = 'otir';

export const outd = (cpu: Cpu) => {
    cpu.bus.out(cpu.c, cpu.bus.read8(cpu.hl));
    cpu.hl--;
    cpu.b--;
    cpu.flags.s = !!(cpu.b & 0x80);
    cpu.flags.z = cpu.b === 0;
    cpu.flags.n = true;
}
outd.fname = 'outd';

export const otdr = (cpu: Cpu) => {
    outd(cpu);
    if (cpu.b === 0) {
        return true;
    }
    cpu.flags.z = true;
    cpu.pc -= 2;
    return false;
}
otdr.fname = 'otdr';

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
addAcc.fname = 'add';

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
adcAcc.fname = 'adc';

export const subAcc = (cpu: Cpu, value: number) => {
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
subAcc.fname = 'sub';

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
    let result = cpu.a - value;
    cpu.flags.s = !!(result & 0x80);
    cpu.flags.z = !(result & 0xff);
    cpu.flags.h = !!(((cpu.a & 0x0f) - (value & 0x0f)) & 0x10);
    if ((cpu.a & 0x80) === (value & 0x80)) cpu.flags.pv = false;
    else cpu.flags.pv = (result & 0x80) !== (cpu.a & 0x80);
    cpu.flags.n = true;
    cpu.flags.c = !!(result & 0x100);
}
cpAcc.fname = 'cp';
