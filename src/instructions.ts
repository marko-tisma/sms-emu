import * as alu from "./alu";
import { Cpu, RegisterName } from "./cpu";
import { AccumulatorFunction, BlockFunction, ConditionalFunction, Decoded, Instruction, InterruptMode, Params, RegisterPair, RegisterSingle, RotateFunction } from "./decoder";
import { toHex } from "./util";

export const get = (
    constructor: (cpu: Cpu, params?: any) => Instruction,
    params?: Params
): Decoded => {

    return {instructionConstructor: constructor, params};
}

export const nop = (cpu: Cpu) => {
    return {
        tstates: () => 4, 
        execute: () => {},
        disassembly: () => 'nop'
    }
}

export const noni = (cpu: Cpu) => {
    return {
        tstates: () => 8,
        execute: () => {
            cpu.iff1 = false;
            cpu.iff2 = false;
            cpu.eiRequested = true;
        },
        disassembly: () => 'noni'
    }
}

export const ex_af_af1 = (cpu: Cpu) => {
    return {
        tstates: () => 4,
        execute: () => {
            const tmpA = cpu.registers[RegisterName.A];
            const tmpF = cpu.registers[RegisterName.F];
            cpu.registers[RegisterName.A] = cpu.shadowRegisters[RegisterName.A];
            cpu.registers[RegisterName.F] = cpu.shadowRegisters[RegisterName.F];
            cpu.shadowRegisters[RegisterName.A] = tmpA;
            cpu.shadowRegisters[RegisterName.F] = tmpF;
            const tmpFlags = cpu.flags;
            cpu.flags = cpu.shadowFlags;
            cpu.shadowFlags = tmpFlags;
        },
        disassembly: () => 'ex af af`' 
    }
}

export const djnz_d = (cpu: Cpu) => {
    return {
        tstates: () => cpu.b === 0 ? 8 : 13,
        execute: () => {
            const d = cpu.next8Signed();
            cpu.b--;
            if (cpu.b != 0) {
                cpu.pc += d; 
            }
        },
        disassembly: () => `djnz D`
    }
}

export const jr_d = (cpu: Cpu) => {
    return {
        tstates: () => 12,
        execute: () => {
            const d = cpu.next8Signed();
            cpu.pc += d; 
        },
        disassembly: () => `jr D`
    }
}

export const jr_cc = (cpu: Cpu, p: {cc: ConditionalFunction}) => {
    return {
        tstates: () => p.cc(cpu) ? 12 : 7,
        execute: () => {
            const d = cpu.next8Signed();
            if (p.cc(cpu)) {
                cpu.pc += d;
            }
        },
        disassembly: () => `jr ${p.cc.fname}, D`
    }
}

export const ld_rp_nn = (cpu: Cpu, p: {rp: RegisterPair}) => {
    return {
        tstates: () => 10,
        execute: () => {
            cpu[p.rp] = cpu.next16();
        },
        disassembly: () => `ld ${p.rp}, NN`
    }
}

export const add_rp_rp = (cpu: Cpu, p: {dst: RegisterPair, src: RegisterPair}) => {
    return {
        tstates: () => 11,
        execute: () => {
            cpu[p.dst] = alu.add16(cpu, cpu[p.dst], cpu[p.src]);
        },
        disassembly: () => `add ${p.dst}, ${p.src}`
    }
}

export const ld_mem_rp_a = (cpu: Cpu, p: {rp: RegisterPair}) => {
    return {
        tstates: () => 7,
        execute: () => {
            cpu.bus.write8(cpu[p.rp], cpu.a);
        },
        disassembly: () => `ld (${p.rp}), a`
    }
}

export const ld_mem_nn_a = (cpu: Cpu) => {
    return {
        tstates: () => 13,
        execute: () => {
            cpu.bus.write8(cpu.next16(), cpu.a);
        },
        disassembly: () => `ld (NN), a`
    }
}

export const ld_a_mem_rp = (cpu: Cpu, p: {rp: RegisterPair}) => {
    return {
        tstates: () => 7,
        execute: () => {
            cpu.a = cpu.bus.read8(cpu[p.rp]);
        },
        disassembly: () => `ld a, (${p.rp})`
    }
}

export const ld_a_mem_nn = (cpu: Cpu) => {
    return {
        tstates: () => 13,
        execute: () => {
            cpu.a = cpu.bus.read8(cpu.next16());
        },
        disassembly: () => `ld a, (NN)`
    }
}

export const inc_rp = (cpu: Cpu, p: {rp: RegisterPair}) => {
    return {
        tstates: () => 6,
        execute: () => {
            cpu[p.rp]++;
        },
        disassembly: () => `inc ${p.rp}`
    }
}

export const dec_rp = (cpu: Cpu, p: {rp: RegisterPair}) => {
    return {
        tstates: () => 6,
        execute: () => {
            cpu[p.rp]--;
        },
        disassembly: () => `dec ${p.rp}`
    }
}

export const inc_r = (cpu: Cpu, p: {rs: RegisterSingle}) => {
    return {
        tstates: () => p.rs.startsWith('(') ? 11 : 4,
        execute: () => {
            cpu[p.rs] = alu.inc8(cpu, cpu[p.rs]);
        },
        disassembly: () => `inc ${p.rs}`
    }
}

export const inc_idx = (cpu: Cpu, p: {idx: 'ix' | 'iy'}) => {
    return {
        tstates: () => 23,
        execute: () => {
            const d = cpu.next8Signed();
            const byte = cpu.bus.read8(cpu[p.idx] + d);
            cpu.bus.write8(cpu[p.idx] + d, alu.inc8(cpu, byte));
        },
        disassembly: () => `inc (${p.idx} + D)`
    }
}

export const dec_idx = (cpu: Cpu, p: {idx: 'ix' | 'iy'}) => {
    return {
        tstates: () => 23,
        execute: () => {
            const d = cpu.next8Signed();
            const byte = cpu.bus.read8(cpu[p.idx] + d);
            cpu.bus.write8(cpu[p.idx] + d, alu.dec8(cpu, byte));
        },
        disassembly: () => `inc (${p.idx} + D)`
    }
}

export const dec_r = (cpu: Cpu, p: {rs: RegisterSingle}) => {
    return {
        tstates: () => p.rs.startsWith('(') ? 11 : 4,
        execute: () => {
            cpu[p.rs] = alu.dec8(cpu, cpu[p.rs])
        },
        disassembly: () => `dec ${p.rs}`
    }
}

export const ld_r_n = (cpu: Cpu, p: {rs: RegisterSingle}) => {
    return {
        tstates: () => p.rs.startsWith('(') ? 10: 7,
        execute: () => {
            cpu[p.rs] = cpu.next8();
        },
        disassembly: () => `ld ${p.rs}, N`
    }
}

export const rot_a = (cpu: Cpu, p: {rot: RotateFunction}) => {
    return {
        tstates: () => 4,
        execute: () => {
            const [z, s, pv] = [cpu.flags.z, cpu.flags.s, cpu.flags.pv];
            cpu.a = p.rot(cpu, cpu.a);
            cpu.flags.z = z;
            cpu.flags.s = s;
            cpu.flags.pv = pv;
        },
        disassembly: () => `${p.rot.fname}a`
    }
}

export const daa = (cpu: Cpu) => {
    return {
        tstates: () => 4,
        execute: () => {
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
            cpu.flags.pv = alu.parity(cpu.a);
        },
        disassembly: () => 'daa'
    }
}

export const cpl = (cpu: Cpu) => {
    return {
        tstates: () => 4,
        execute: () => {
            cpu.a = ~cpu.a;
            cpu.flags.h = true;
            cpu.flags.n = true;
        },
        disassembly: () => 'cpl'
    }
}

export const scf = (cpu: Cpu) => {
    return {
        tstates: () => 4,
        execute: () => {
            cpu.flags.c = true;
            cpu.flags.h = false;
            cpu.flags.n = false;
        },
        disassembly: () => 'scf'
    }
}

export const ccf = (cpu: Cpu) => {
    return {
        tstates: () => 4,
        execute: () => {
            cpu.flags.h = cpu.flags.c;
            cpu.flags.c = !cpu.flags.c;
            cpu.flags.n = false;
        },
        disassembly: () => 'ccf'
    }
}

export const halt = (cpu: Cpu) => {
    return {
        tstates: () => 4,
        execute: () => {
            cpu.halted = true;
        },
        disassembly: () => 'halt'
    }
}

export const ld_r_r = (cpu: Cpu, p: {dst: RegisterSingle, src: RegisterSingle}) => {
    return {
        tstates: () => (p.dst.startsWith('(') || p.src.startsWith('(')) ? 7 : 4,
        execute: () => {
            cpu[p.dst] = cpu[p.src];
        },
        disassembly: () => `ld ${p.dst}, ${p.src}`
    }
}

export const ld_idx_n = (cpu: Cpu, p: {idx: 'ix' | 'iy'}) => {
    return {
        tstates: () => 19,
        execute: () => {
            const d = cpu.next8Signed();
            const n = cpu.next8();
            cpu.bus.write8(cpu[p.idx] + d, n);
        },
        disassembly: () => `ld (${p.idx} + D), N`
    }
}

export const alu_r = (cpu: Cpu, p: {acc: AccumulatorFunction, rs: RegisterSingle}) => {
    return {
        tstates: () => p.rs === '(hl)' ? 7 : 4,
        execute: () => {
            p.acc(cpu, cpu[p.rs])
        },
        disassembly: () => `${p.acc.fname} ${p.rs}`
    }
}

export const ret_cc = (cpu: Cpu, p: {cc: ConditionalFunction}) => {
    return {
        tstates: () => p.cc(cpu) ? 11 : 5,
        execute: () => {
            if (p.cc(cpu)) {
                cpu.pc = cpu.pop16();
            }
        },
        disassembly: () => `ret ${p.cc.fname}`
    }
}

export const pop_rp = (cpu: Cpu, p: {rp: RegisterPair}) => {
    return {
        tstates: () => 10,
        execute: () => {
            cpu[p.rp] = cpu.pop16();
        },
        disassembly: () => `pop ${p.rp}`
    }
}

export const ret = (cpu: Cpu) => {
    return {
        tstates: () => 10,
        execute: () => {
            cpu.pc = cpu.pop16();
        },
        disassembly: () => 'ret'
    }
}

export const exx = (cpu: Cpu) => {
    return {
        tstates: () => 4,
        execute: () => {
            const tmp = cpu.registers;
            cpu.registers = cpu.shadowRegisters;
            cpu.shadowRegisters = tmp;

            const tmpA = cpu.registers[RegisterName.A];
            cpu.registers[RegisterName.A] = cpu.shadowRegisters[RegisterName.A];
            cpu.shadowRegisters[RegisterName.A] = tmpA;
        },
        disassembly: () => 'exx'
    }
}

export const jp_rp = (cpu: Cpu, p: {rp: RegisterPair}) => {
    return {
        tstates: () => 4,
        execute: () => {
            cpu.pc = cpu[p.rp];
        },
        disassembly: () => `jp ${p.rp}`
    }
}

export const ld_sp_rp = (cpu: Cpu, p: {rp: RegisterPair}) => {
    return {
        tstates: () => 6,
        execute: () => {
            cpu.sp = cpu[p.rp];
        },
        disassembly: () => `ld sp, ${p.rp}`
    }
}

export const jp_cc_nn = (cpu: Cpu, p: {cc: ConditionalFunction}) => {
    return {
        tstates: () => 10,
        execute: () => {
            const nn = cpu.next16();
            if (p.cc(cpu)) {
                cpu.pc = nn;
            }
        },
        disassembly: () => `jp ${p.cc.fname}, NN`
    }
}

export const jp_nn = (cpu: Cpu) => {
    return {
        tstates: () => 10,
        execute: () => {
            cpu.pc = cpu.next16();
        },
        disassembly: () => `jp NN`
    }
}

export const rot_r = (cpu: Cpu, p: {rot: RotateFunction, rs: RegisterSingle}) => {
    return {
        tstates: () => p.rs === '(hl)' ? 15 : 8,
        execute: () => {
            cpu[p.rs] = p.rot(cpu, cpu[p.rs]);
        },
        disassembly: () => `${p.rot.fname} ${p.rs}`
    }
}

export const bit_y_r = (cpu: Cpu, p: {y: number, rs: RegisterSingle}) => {
    return {
        tstates: () => 8,
        execute: () => {
            alu.bit_y(cpu, cpu[p.rs], p.y);
        },
        disassembly: () => `bit ${p.y}, ${p.rs}`
    }
}

export const res_y_r = (cpu: Cpu, p: {y: number, rs: RegisterSingle}) => {
    return {
        tstates: () => 8,
        execute: () => {
            const mask = 1 << p.y;
            cpu[p.rs] &= (~mask);
        },
        disassembly: () => `res $${toHex(p.y, 2)} ${p.rs}`
    }
}

export const set_y_r = (cpu: Cpu, p: {y: number, rs: RegisterSingle}) => {
    return {
        tstates: () => 8,
        execute: () => {
            cpu[p.rs] |= 1 << p.y;
        },
        disassembly: () => `set $${toHex(p.y, 2)} ${p.rs}`
    }
}

export const out_n_a = (cpu: Cpu) => {
    return {
        tstates: () => 11,
        execute: () => {
            cpu.bus.out(cpu.next8(), cpu.a);
        },
        disassembly: () => `out (N), a`
    }
}

export const in_a_n = (cpu: Cpu) => {
    return {
        tstates: () => 11,
        execute: () => {
            cpu.a = cpu.bus.in(cpu.next8());
        },
        disassembly: () => `in a, (N)`
    }
}

export const ex_mem_sp_rp = (cpu: Cpu, p: {rp: RegisterPair}) => {
    return {
        tstates: () => 19,
        execute: () => {
            let tmp = cpu.bus.read16(cpu.sp);
            cpu.bus.write16(cpu.sp, cpu[p.rp]);
            cpu[p.rp] = tmp;
        },
        disassembly: () => `ex (sp), ${p.rp}`
    }
}

export const ex_de_hl = (cpu: Cpu) => {
    return {
        tstates: () => 4,
        execute: () => {
            const tmpDe = cpu.de;
            cpu.de = cpu.hl;
            cpu.hl = tmpDe;
        },
        disassembly: () => 'ex de, hl'
    }
}

export const di = (cpu: Cpu) => {
    return {
        tstates: () => 4,
        execute: () => {
            cpu.iff1 = false;
            cpu.iff2 = false;
        },
        disassembly: () => 'di'
    }
}

export const ei = (cpu: Cpu) => {
    return {
        tstates: () => 4,
        execute: () => {
            cpu.eiRequested = true;
    },
        disassembly: () => 'ei'
    }
}

export const push_rp = (cpu: Cpu, p: {rp: RegisterPair}) => {
    return {
        tstates: () => 11,
        execute: () => {
            cpu.push16(cpu[p.rp]);
        },
        disassembly: () => `push ${p.rp}`
    }
}

export const call_nn = (cpu: Cpu) => {
    return {
        tstates: () => 17,
        execute: () => {
            const nn = cpu.next16();
            cpu.push16(cpu.pc);
            cpu.pc = nn;
        },
        disassembly: () => `call NN`
    }
}

export const call_cc_nn = (cpu: Cpu, p: {cc: ConditionalFunction}) => {
    return {
        tstates: () => p.cc(cpu) ? 17 : 10,
        execute: () => {
            const nn = cpu.next16();
            if (p.cc(cpu)) {
                cpu.push16(cpu.pc);
                cpu.pc = nn; 
            }
        },
        disassembly: () => `call ${p.cc.fname}, NN`
    }
}

export const alu_n = (cpu: Cpu, p: {acc: AccumulatorFunction}) => {
    return {
        tstates: () => 7,
        execute: () => {
            p.acc(cpu, cpu.next8());
        },
        disassembly: () => `${p.acc.fname} N`
    }
}

export const rst = (cpu: Cpu, p: {address: number}) => {
    return {
        tstates: () => 11,
        execute: () => {
            cpu.push16(cpu.pc);
            cpu.pc = p.address;
        },
        disassembly: () => `RST $${toHex(p.address, 4)}`
    }
}

export const in_c = (cpu: Cpu) => {
    return {
        tstates: () => 12,
        execute: () => {
            alu.io_in(cpu, cpu.c);
        },
        disassembly: () => 'in (c)'
    }
}

export const in_r_c = (cpu: Cpu, p: {rs: RegisterSingle}) => {
    return {
        tstates: () => 12,
        execute: () => {
            cpu[p.rs] = alu.io_in(cpu, cpu.c);
        },
        disassembly: () => `in ${p.rs}, (c)`
    }
}

export const out_c_0 = (cpu: Cpu) => {
    return {
        tstates: () => 12,
        execute: () => {
            cpu.bus.out(cpu.c, 0);
        },
        disassembly: () => 'out (c), 0'
    }
}

export const out_c_r = (cpu: Cpu, p: {rs: RegisterSingle}) => {
    return {
        tstates: () => 12,
        execute: () => {
            cpu.bus.out(cpu.c, cpu[p.rs]);
        },
        disassembly: () => `out (c), ${p.rs}`
    }
}

export const sbc_hl_rp = (cpu: Cpu, p: {rp: RegisterPair}) => {
    return {
        tstates: () => 15,
        execute: () => {
            cpu.hl = alu.sbc16(cpu, cpu.hl, cpu[p.rp]);
        },
        disassembly: () => `sbc hl, ${p.rp}`
    }
}

export const adc_hl_rp = (cpu: Cpu, p: {rp: RegisterPair}) => {
    return {
        tstates: () => 15,
        execute: () => {
            cpu.hl = alu.adc16(cpu, cpu.hl, cpu[p.rp]);
        },
        disassembly: () => `adc hl, ${p.rp}`
    }
}

export const ld_mem_nn_rp = (cpu: Cpu, p: {rp: RegisterPair}) => {
    return {
        tstates: () => p.rp === 'hl' || p.rp.startsWith('i') ? 16 : 20,
        execute: () => {
            cpu.bus.write16(cpu.next16(), cpu[p.rp]);
        },
        disassembly: () => `ld (NN), ${p.rp}`
    }
}

export const ld_rp_mem_nn = (cpu: Cpu, p: {rp: RegisterPair}) => {
    return {
        tstates: () => p.rp === 'hl'  || p.rp.startsWith('i') ? 16 : 20,
        execute: () => {
            cpu[p.rp] = cpu.bus.read16(cpu.next16());
        },
        disassembly: () => `ld ${p.rp}, (NN)`
    }
}

export const neg = (cpu: Cpu) => {
    return {
        tstates: () => 8,
        execute: () => {
            const result = (0 - cpu.a) & 0xff;
            cpu.flags.pv = cpu.a === 0x80;
            cpu.flags.c = cpu.a !== 0;
            cpu.flags.h = !!((0 - (cpu.a & 0xf)) && 0x10);
            cpu.flags.s = !!(result & 0x80);
            cpu.flags.z = !result;
            cpu.flags.n = true;
            cpu.a = result;
        },
        disassembly: () => 'neg'
    }
}

export const reti = (cpu: Cpu) => {
    return {
        tstates: () => 14,
        execute: () => {
            cpu.pc = cpu.pop16();
        },
        disassembly: () => 'reti'
    }
}

export const retn = (cpu: Cpu) => {
    return {
        tstates: () => 14,
        execute: () => {
            cpu.pc = cpu.pop16();
            cpu.iff1 = cpu.iff2;
            cpu.handlingReset = false;
        },
        disassembly: () => 'retn'
    }
}

export const im = (cpu: Cpu, p: {im: InterruptMode}) => {
    return {
        tstates: () => 8,
        execute: () => {
            cpu.interruptMode = p.im;
        },
        disassembly: () => p.im === undefined ? 'im 0/1' : `im ${p.im}`
    }
}

export const rot_idx = (cpu: Cpu, p: {rot: RotateFunction, idx: 'ix' | 'iy'}) => {
    return {
        tstates: () => 23,
        execute: () => {
            const address = cpu[p.idx] + cpu.next8Signed();
            cpu.pc++;
            cpu.bus.write8(address, p.rot(cpu, cpu.bus.read8(address)));
       },
        disassembly: () => `${p.rot.fname} (${p.idx} + D)`
    }
}

export const ld_r_rot_idx = (cpu: Cpu, p: {rot: RotateFunction, rs: RegisterSingle, idx: 'ix' | 'iy'}) => {
    return {
        tstates: () => 23,
        execute: () => {
            const address = cpu[p.idx] + cpu.next8Signed();
            cpu.pc++;
            cpu.bus.write8(address, p.rot(cpu, cpu.bus.read8(address)));
            cpu[p.rs] = cpu.bus.read8(address);
        },
        disassembly: () => `${p.rot.fname} (${p.idx} + D), ${p.rs}`
    }
}

export const bit_y_idx = (cpu: Cpu,  p: {y: number, idx: 'ix' | 'iy'}) => {
    return {
        tstates: () => 20,
        execute: () => {
            const address = cpu[p.idx] + cpu.next8Signed();
            cpu.pc++;
            alu.bit_y(cpu, cpu.bus.read8(address), p.y);
        },
        disassembly: () => `bit $${toHex(p.y, 2)}, ($${p.idx} + D)`
    }
}

export const res_y_idx = (cpu: Cpu, p: {y: number, idx: 'ix' | 'iy'}) => {
    return {
        tstates: () => 23,
        execute: () => {
            const address = cpu[p.idx] + cpu.next8Signed();
            cpu.pc++;
            const result = (~(1 << p.y)) & cpu.bus.read8(address);
            cpu.bus.write8(address, result);
        },
        disassembly: () => `res $${toHex(p.y, 2)}, ($${p.idx} + D)`
    }
}

export const ld_res_y_idx = (cpu: Cpu,  p: {y: number, rs: RegisterSingle, idx: 'ix' | 'iy'}) => {
    return {
        tstates: () => 23,
        execute: () => {
            const address = cpu[p.idx] + cpu.next8Signed();
            cpu.pc++;
            const result = (~(1 << p.y)) & cpu.bus.read8(address);
            cpu.bus.write8(address, result);
            cpu[p.rs] = cpu.bus.read8(address);
        },
        disassembly: () => `res $${toHex(p.y, 2)}, ($${p.idx} + D), ${p.rs}`
    }
}

export const set_y_idx = (cpu: Cpu,  p: {y: number, idx: 'ix' | 'iy'}) => {
    return {
        tstates: () => 23,
        execute: () => {
            const address = cpu[p.idx] + cpu.next8Signed();
            cpu.pc++;
            const result = (1 << p.y) | cpu.bus.read8(address);
            cpu.bus.write8(address, result);
        },
        disassembly: () => `set $${toHex(p.y, 2)}, ($${p.idx} + D)`
    }
}

export const ld_set_y_idx = (cpu: Cpu,  p: {y: number, rs: RegisterSingle, idx: 'ix' | 'iy'}) => {
    return {
        tstates: () => 23,
        execute: () => {
            const address = cpu[p.idx] + cpu.next8Signed();
            cpu.pc++;
            const result = (1 << p.y) | cpu.bus.read8(address);
            cpu.bus.write8(address, result);
            cpu[p.rs] = cpu.bus.read8(address);
        },
        disassembly: () => `set $${toHex(p.y, 2)}, ($${p.idx} + D), ${p.rs}`
    }
}

export const bl_i = (cpu: Cpu, p: {bli: BlockFunction}) => {
    if (p.bli === undefined) return nop(cpu);
    return {
        tstates: () => p.bli.fname.endsWith('r') && cpu.b !== 0 ? 21 : 16,
        execute: () => { p.bli(cpu) },
        disassembly: () => `${p.bli.fname}`
    }
}

export const rrd = (cpu: Cpu) => {
    return {
        tstates: () => 18,
        execute: () => {
            const a = cpu.a;
            const byte = cpu.bus.read8(cpu.hl);
            cpu.a = (cpu.a & 0xf0) | (byte & 0xf);
            cpu.bus.write8(cpu.hl, ((a & 0xf) << 4) | (byte >>> 4)); 
            cpu.flags.s = !!(cpu.a & 0x80);
            cpu.flags.z = !cpu.a;
            cpu.flags.h = false;
            cpu.flags.pv = alu.parity(cpu.a);
            cpu.flags.n = false;
        },
        disassembly: () => 'rrd'
    }
}

export const rld = (cpu: Cpu) => {
    return {
        tstates: () => 18,
        execute: () => {
            const a = cpu.a;
            const byte = cpu.bus.read8(cpu.hl);
            cpu.a = (cpu.a & 0xf0) | (byte >>> 4);
            cpu.bus.write8(cpu.hl, (byte << 4) | (a & 0xf));
            cpu.flags.s = !!(cpu.a & 0x80);
            cpu.flags.z = !cpu.a;
            cpu.flags.h = false;
            cpu.flags.pv = alu.parity(cpu.a);
            cpu.flags.n = false;
        },
        disassembly: () => 'rld'
    }
}

export const ld_a_i = (cpu: Cpu) => {
    return {
        tstates: () => 9,
        execute: () => {
            cpu.a = cpu.i;
            cpu.flags.s = !!(cpu.a & 0x80);
            cpu.flags.z = !cpu.a;
            cpu.flags.h = false;
            cpu.flags.pv = cpu.iff2;
            cpu.flags.n = false;
        },
        disassembly: () => 'ld a, i'
    }
}

export const ld_i_a = (cpu: Cpu) => {
    return {
        tstates: () => 9,
        execute: () => {
            cpu.i = cpu.a;
        },
        disassembly: () => 'ld i, a'
    }
}