import * as alu from "./alu";
import { Cpu, RegisterName } from "./cpu";
import { AccumulatorFunction, BlockFunction, ConditionalFunction, Decoded, Instruction, InterruptMode, Params, RegisterPair, RegisterSingle, RotateFunction } from "./decoder";
import { toHex } from "./util";

export const get = (
    instructionConstructor: (cpu: Cpu, params?: any) => Instruction,
    params?: Params
): Decoded => {

    return {instructionConstructor, params};
}

export const nop = (cpu: Cpu) => {
    return {
        execute: () => {
            cpu.tstates += 4;
        },
        disassembly: () => 'nop'
    }
}

export const noni = (cpu: Cpu) => {
    return {
        execute: () => {
            cpu.iff1 = false;
            cpu.iff2 = false;
            cpu.eiRequested = true;
            cpu.tstates += 8;
        },
        disassembly: () => 'noni'
    }
}

export const ex_af_af1 = (cpu: Cpu) => {
    return {
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
            cpu.tstates += 4;
        },
        disassembly: () => 'ex af af`' 
    }
}

export const djnz_d = (cpu: Cpu) => {
    return {
        execute: () => {
            const d = cpu.next8Signed();
            cpu.b--;
            if (cpu.b != 0) {
                cpu.pc += d; 
                cpu.tstates += 13;
            }
            else cpu.tstates += 8;
        },
        disassembly: () => `djnz D`
    }
}

export const jr_d = (cpu: Cpu) => {
    return {
        execute: () => {
            const d = cpu.next8Signed();
            cpu.pc += d; 
            cpu.tstates += 12;
        },
        disassembly: () => `jr D`
    }
}

export const jr_cc = (cpu: Cpu, p: {cc: ConditionalFunction}) => {
    return {
        execute: () => {
            const d = cpu.next8Signed();
            if (p.cc(cpu)) {
                cpu.pc += d;
                cpu.tstates += 12;
            }
            else cpu.tstates += 7;
        },
        disassembly: () => `jr ${p.cc.fname}, D`
    }
}

export const ld_rp_nn = (cpu: Cpu, p: {rp: RegisterPair}) => {
    return {
        execute: () => {
            cpu[p.rp] = cpu.next16();
            cpu.tstates += 10;
        },
        disassembly: () => `ld ${p.rp}, NN`
    }
}

export const add_rp_rp = (cpu: Cpu, p: {dst: RegisterPair, src: RegisterPair}) => {
    return {
        execute: () => {
            cpu[p.dst] = alu.add16(cpu, cpu[p.dst], cpu[p.src]);
            cpu.tstates += 11;
        },
        disassembly: () => `add ${p.dst}, ${p.src}`
    }
}

export const ld_mem_rp_a = (cpu: Cpu, p: {rp: RegisterPair}) => {
    return {
        execute: () => {
            cpu.bus.write8(cpu[p.rp], cpu.a);
            cpu.tstates += 7;
        },
        disassembly: () => `ld (${p.rp}), a`
    }
}

export const ld_mem_nn_a = (cpu: Cpu) => {
    return {
        execute: () => {
            cpu.bus.write8(cpu.next16(), cpu.a);
            cpu.tstates += 13;
        },
        disassembly: () => `ld (NN), a`
    }
}

export const ld_a_mem_rp = (cpu: Cpu, p: {rp: RegisterPair}) => {
    return {
        execute: () => {
            cpu.a = cpu.bus.read8(cpu[p.rp]);
            cpu.tstates += 7;
        },
        disassembly: () => `ld a, (${p.rp})`
    }
}

export const ld_a_mem_nn = (cpu: Cpu) => {
    return {
        execute: () => {
            cpu.a = cpu.bus.read8(cpu.next16());
            cpu.tstates += 13;
        },
        disassembly: () => `ld a, (NN)`
    }
}

export const inc_rp = (cpu: Cpu, p: {rp: RegisterPair}) => {
    return {
        execute: () => {
            cpu[p.rp]++;
            cpu.tstates += 6;
        },
        disassembly: () => `inc ${p.rp}`
    }
}

export const dec_rp = (cpu: Cpu, p: {rp: RegisterPair}) => {
    return {
        execute: () => {
            cpu[p.rp]--;
            cpu.tstates += 6;
        },
        disassembly: () => `dec ${p.rp}`
    }
}

export const inc_r = (cpu: Cpu, p: {rs: RegisterSingle}) => {
    return {
        execute: () => {
            cpu[p.rs] = alu.inc8(cpu, cpu[p.rs]);
            cpu.tstates += p.rs.startsWith('(') ? 11 : 4;
        },
        disassembly: () => `inc ${p.rs}`
    }
}

export const inc_idx = (cpu: Cpu, p: {idx: 'ix' | 'iy'}) => {
    return {
        execute: () => {
            const d = cpu.next8Signed();
            const byte = cpu.bus.read8(cpu[p.idx] + d);
            cpu.bus.write8(cpu[p.idx] + d, alu.inc8(cpu, byte));
            cpu.tstates += 23;
        },
        disassembly: () => `inc (${p.idx} + D)`
    }
}

export const dec_idx = (cpu: Cpu, p: {idx: 'ix' | 'iy'}) => {
    return {
        execute: () => {
            const d = cpu.next8Signed();
            const byte = cpu.bus.read8(cpu[p.idx] + d);
            cpu.bus.write8(cpu[p.idx] + d, alu.dec8(cpu, byte));
            cpu.tstates += 23;
        },
        disassembly: () => `inc (${p.idx} + D)`
    }
}

export const dec_r = (cpu: Cpu, p: {rs: RegisterSingle}) => {
    return {
        execute: () => {
            cpu[p.rs] = alu.dec8(cpu, cpu[p.rs])
            cpu.tstates += p.rs.startsWith('(') ? 11 : 4;
        },
        disassembly: () => `dec ${p.rs}`
    }
}

export const ld_r_n = (cpu: Cpu, p: {rs: RegisterSingle}) => {
    return {
        execute: () => {
            cpu[p.rs] = cpu.next8();
            cpu.tstates += p.rs.startsWith('(') ? 10: 7;
        },
        disassembly: () => `ld ${p.rs}, N`
    }
}

export const rot_a = (cpu: Cpu, p: {rot: RotateFunction}) => {
    return {
        execute: () => {
            const [z, s, pv] = [cpu.flags.z, cpu.flags.s, cpu.flags.pv];
            cpu.a = p.rot(cpu, cpu.a);
            cpu.flags.z = z;
            cpu.flags.s = s;
            cpu.flags.pv = pv;
            cpu.tstates += 4;
        },
        disassembly: () => `${p.rot.fname}a`
    }
}

export const daa = (cpu: Cpu) => {
    return {
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
            cpu.tstates += 4;
        },
        disassembly: () => 'daa'
    }
}

export const cpl = (cpu: Cpu) => {
    return {
        execute: () => {
            cpu.a = ~cpu.a;
            cpu.flags.h = true;
            cpu.flags.n = true;
            cpu.tstates += 4;
        },
        disassembly: () => 'cpl'
    }
}

export const scf = (cpu: Cpu) => {
    return {
        execute: () => {
            cpu.flags.c = true;
            cpu.flags.h = false;
            cpu.flags.n = false;
            cpu.tstates += 4;
        },
        disassembly: () => 'scf'
    }
}

export const ccf = (cpu: Cpu) => {
    return {
        execute: () => {
            cpu.flags.h = cpu.flags.c;
            cpu.flags.c = !cpu.flags.c;
            cpu.flags.n = false;
            cpu.tstates += 4;
        },
        disassembly: () => 'ccf'
    }
}

export const halt = (cpu: Cpu) => {
    return {
        execute: () => {
            cpu.halted = true;
            cpu.tstates += 4;
        },
        disassembly: () => 'halt'
    }
}

export const ld_r_r = (cpu: Cpu, p: {dst: RegisterSingle, src: RegisterSingle}) => {
    return {
        execute: () => {
            cpu[p.dst] = cpu[p.src];
            cpu.tstates += (p.dst.startsWith('(') || p.src.startsWith('(')) ? 7 : 4;
        },
        disassembly: () => `ld ${p.dst}, ${p.src}`
    }
}

export const ld_idx_n = (cpu: Cpu, p: {idx: 'ix' | 'iy'}) => {
    return {
        execute: () => {
            const d = cpu.next8Signed();
            const n = cpu.next8();
            cpu.bus.write8(cpu[p.idx] + d, n);
            cpu.tstates += 19;
        },
        disassembly: () => `ld (${p.idx} + D), N`
    }
}

export const alu_r = (cpu: Cpu, p: {acc: AccumulatorFunction, rs: RegisterSingle}) => {
    return {
        execute: () => {
            p.acc(cpu, cpu[p.rs])
            cpu.tstates += p.rs === '(hl)' ? 7 : 4;
        },
        disassembly: () => `${p.acc.fname} ${p.rs}`
    }
}

export const ret_cc = (cpu: Cpu, p: {cc: ConditionalFunction}) => {
    return {
        execute: () => {
            if (p.cc(cpu)) {
                cpu.pc = cpu.pop16();
                cpu.tstates += 11;
            }
            else cpu.tstates += 5;
        },
        disassembly: () => `ret ${p.cc.fname}`
    }
}

export const pop_rp = (cpu: Cpu, p: {rp: RegisterPair}) => {
    return {
        execute: () => {
            cpu[p.rp] = cpu.pop16();
            cpu.tstates += 10;
        },
        disassembly: () => `pop ${p.rp}`
    }
}

export const ret = (cpu: Cpu) => {
    return {
        execute: () => {
            cpu.pc = cpu.pop16();
            cpu.tstates += 10;
        },
        disassembly: () => 'ret'
    }
}

export const exx = (cpu: Cpu) => {
    return {
        execute: () => {
            const tmp = cpu.registers;
            cpu.registers = cpu.shadowRegisters;
            cpu.shadowRegisters = tmp;

            const tmpA = cpu.registers[RegisterName.A];
            cpu.registers[RegisterName.A] = cpu.shadowRegisters[RegisterName.A];
            cpu.shadowRegisters[RegisterName.A] = tmpA;
            cpu.tstates += 4;
        },
        disassembly: () => 'exx'
    }
}

export const jp_rp = (cpu: Cpu, p: {rp: RegisterPair}) => {
    return {
        execute: () => {
            cpu.pc = cpu[p.rp];
            cpu.tstates += 4;
        },
        disassembly: () => `jp ${p.rp}`
    }
}

export const ld_sp_rp = (cpu: Cpu, p: {rp: RegisterPair}) => {
    return {
        execute: () => {
            cpu.sp = cpu[p.rp];
            cpu.tstates += 6;
        },
        disassembly: () => `ld sp, ${p.rp}`
    }
}

export const jp_cc_nn = (cpu: Cpu, p: {cc: ConditionalFunction}) => {
    return {
        execute: () => {
            const nn = cpu.next16();
            if (p.cc(cpu)) {
                cpu.pc = nn;
            }
            cpu.tstates += 10;
        },
        disassembly: () => `jp ${p.cc.fname}, NN`
    }
}

export const jp_nn = (cpu: Cpu) => {
    return {
        execute: () => {
            cpu.pc = cpu.next16();
            cpu.tstates += 10;
        },
        disassembly: () => `jp NN`
    }
}

export const rot_r = (cpu: Cpu, p: {rot: RotateFunction, rs: RegisterSingle}) => {
    return {
        execute: () => {
            cpu[p.rs] = p.rot(cpu, cpu[p.rs]);
            cpu.tstates += p.rs === '(hl)' ? 15 : 8;
        },
        disassembly: () => `${p.rot.fname} ${p.rs}`
    }
}

export const bit_y_r = (cpu: Cpu, p: {y: number, rs: RegisterSingle}) => {
    return {
        execute: () => {
            alu.bit_y(cpu, cpu[p.rs], p.y);
            cpu.tstates += 8;
            if (p.rs === '(hl)') cpu.tstates += 4;
        },
        disassembly: () => `bit ${p.y}, ${p.rs}`
    }
}

export const res_y_r = (cpu: Cpu, p: {y: number, rs: RegisterSingle}) => {
    return {
        execute: () => {
            const mask = 1 << p.y;
            cpu[p.rs] &= (~mask);
            cpu.tstates += 8;
            if (p.rs === '(hl)') cpu.tstates += 7;
        },
        disassembly: () => `res ${p.y}, ${p.rs}`
    }
}

export const set_y_r = (cpu: Cpu, p: {y: number, rs: RegisterSingle}) => {
    return {
        execute: () => {
            cpu[p.rs] |= 1 << p.y;
            cpu.tstates += 8;
            if (p.rs === '(hl)') cpu.tstates += 7;
        },
        disassembly: () => `set ${p.y}, ${p.rs}`
    }
}

export const out_n_a = (cpu: Cpu) => {
    return {
        execute: () => {
            cpu.bus.out(cpu.next8(), cpu.a);
            cpu.tstates += 11;
        },
        disassembly: () => `out (N), a`
    }
}

export const in_a_n = (cpu: Cpu) => {
    return {
        execute: () => {
            cpu.a = cpu.bus.in(cpu.next8());
            cpu.tstates += 11;
        },
        disassembly: () => `in a, (N)`
    }
}

export const ex_mem_sp_rp = (cpu: Cpu, p: {rp: RegisterPair}) => {
    return {
        execute: () => {
            let tmp = cpu.bus.read16(cpu.sp);
            cpu.bus.write16(cpu.sp, cpu[p.rp]);
            cpu[p.rp] = tmp;
            cpu.tstates += 19;
        },
        disassembly: () => `ex (sp), ${p.rp}`
    }
}

export const ex_de_hl = (cpu: Cpu) => {
    return {
        execute: () => {
            const tmpDe = cpu.de;
            cpu.de = cpu.hl;
            cpu.hl = tmpDe;
            cpu.tstates += 4;
        },
        disassembly: () => 'ex de, hl'
    }
}

export const di = (cpu: Cpu) => {
    return {
        execute: () => {
            cpu.iff1 = false;
            cpu.iff2 = false;
            cpu.tstates += 4;
        },
        disassembly: () => 'di'
    }
}

export const ei = (cpu: Cpu) => {
    return {
        execute: () => {
            // cpu.iff1 = false;
            // cpu.iff2 = false;
            cpu.eiRequested = true;
            cpu.tstates += 4;
        },
        disassembly: () => 'ei'
    }
}

export const push_rp = (cpu: Cpu, p: {rp: RegisterPair}) => {
    return {
        execute: () => {
            cpu.push16(cpu[p.rp]);
            cpu.tstates += 11;
        },
        disassembly: () => `push ${p.rp}`
    }
}

export const call_nn = (cpu: Cpu) => {
    return {
        execute: () => {
            const nn = cpu.next16();
            cpu.push16(cpu.pc);
            cpu.pc = nn;
            cpu.tstates += 17;
        },
        disassembly: () => `call NN`
    }
}

export const call_cc_nn = (cpu: Cpu, p: {cc: ConditionalFunction}) => {
    return {
        execute: () => {
            const nn = cpu.next16();
            if (p.cc(cpu)) {
                cpu.push16(cpu.pc);
                cpu.pc = nn; 
                cpu.tstates += 17;
            }
            else cpu.tstates += 10;
        },
        disassembly: () => `call ${p.cc.fname}, NN`
    }
}

export const alu_n = (cpu: Cpu, p: {acc: AccumulatorFunction}) => {
    return {
        execute: () => {
            p.acc(cpu, cpu.next8());
            cpu.tstates += 7;
        },
        disassembly: () => `${p.acc.fname} N`
    }
}

export const rst = (cpu: Cpu, p: {address: number}) => {
    return {
        execute: () => {
            cpu.push16(cpu.pc);
            cpu.pc = p.address;
            cpu.tstates += 11;
        },
        disassembly: () => `RST $${toHex(p.address, 4)}`
    }
}

export const in_c = (cpu: Cpu) => {
    return {
        execute: () => {
            alu.io_in(cpu, cpu.c);
            cpu.tstates += 12;
        },
        disassembly: () => 'in (c)'
    }
}

export const in_r_c = (cpu: Cpu, p: {rs: RegisterSingle}) => {
    return {
        execute: () => {
            cpu[p.rs] = alu.io_in(cpu, cpu.c);
            cpu.tstates += 12;
        },
        disassembly: () => `in ${p.rs}, (c)`
    }
}

export const out_c_0 = (cpu: Cpu) => {
    return {
        execute: () => {
            cpu.bus.out(cpu.c, 0);
            cpu.tstates += 12;
        },
        disassembly: () => 'out (c), 0'
    }
}

export const out_c_r = (cpu: Cpu, p: {rs: RegisterSingle}) => {
    return {
        execute: () => {
            cpu.bus.out(cpu.c, cpu[p.rs]);
            cpu.tstates += 12;
        },
        disassembly: () => `out (c), ${p.rs}`
    }
}

export const sbc_hl_rp = (cpu: Cpu, p: {rp: RegisterPair}) => {
    return {
        execute: () => {
            cpu.hl = alu.sbc16(cpu, cpu.hl, cpu[p.rp]);
            cpu.tstates += 15;
        },
        disassembly: () => `sbc hl, ${p.rp}`
    }
}

export const adc_hl_rp = (cpu: Cpu, p: {rp: RegisterPair}) => {
    return {
        execute: () => {
            cpu.hl = alu.adc16(cpu, cpu.hl, cpu[p.rp]);
            cpu.tstates += 15;
        },
        disassembly: () => `adc hl, ${p.rp}`
    }
}

export const ld_mem_nn_rp = (cpu: Cpu, p: {rp: RegisterPair}) => {
    return {
        execute: () => {
            cpu.bus.write16(cpu.next16(), cpu[p.rp]);
            cpu.tstates += p.rp === 'hl' || p.rp.startsWith('i') ? 16 : 20;
        },
        disassembly: () => `ld (NN), ${p.rp}`
    }
}

export const ld_rp_mem_nn = (cpu: Cpu, p: {rp: RegisterPair}) => {
    return {
        execute: () => {
            cpu[p.rp] = cpu.bus.read16(cpu.next16());
            cpu.tstates += p.rp === 'hl'  || p.rp.startsWith('i') ? 16 : 20;
        },
        disassembly: () => `ld ${p.rp}, (NN)`
    }
}

export const neg = (cpu: Cpu) => {
    return {
        execute: () => {
            const result = (0 - cpu.a) & 0xff;
            cpu.flags.pv = cpu.a === 0x80;
            cpu.flags.c = cpu.a !== 0;
            cpu.flags.h = !!((0 - (cpu.a & 0xf)) && 0x10);
            cpu.flags.s = !!(result & 0x80);
            cpu.flags.z = !result;
            cpu.flags.n = true;
            cpu.a = result;
            cpu.tstates += 8;
        },
        disassembly: () => 'neg'
    }
}

export const reti = (cpu: Cpu) => {
    return {
        execute: () => {
            cpu.pc = cpu.pop16();
            cpu.tstates += 14;
        },
        disassembly: () => 'reti'
    }
}

export const retn = (cpu: Cpu) => {
    return {
        execute: () => {
            cpu.pc = cpu.pop16();
            cpu.iff1 = cpu.iff2;
            cpu.handlingReset = false;
            cpu.tstates += 14;
        },
        disassembly: () => 'retn'
    }
}

export const im = (cpu: Cpu, p: {im: InterruptMode}) => {
    return {
        execute: () => {
            cpu.interruptMode = p.im;
            cpu.tstates += 8;
        },
        disassembly: () => p.im === undefined ? 'im 0/1' : `im ${p.im}`
    }
}

export const rot_idx = (cpu: Cpu, p: {rot: RotateFunction, idx: 'ix' | 'iy'}) => {
    return {
        execute: () => {
            const address = cpu[p.idx] + cpu.next8Signed();
            cpu.pc++;
            cpu.bus.write8(address, p.rot(cpu, cpu.bus.read8(address)));
            cpu.tstates += 23;
       },
        disassembly: () => `${p.rot.fname} (${p.idx} + D)`
    }
}

export const ld_r_rot_idx = (cpu: Cpu, p: {rot: RotateFunction, rs: RegisterSingle, idx: 'ix' | 'iy'}) => {
    return {
        execute: () => {
            const address = cpu[p.idx] + cpu.next8Signed();
            cpu.pc++;
            cpu.bus.write8(address, p.rot(cpu, cpu.bus.read8(address)));
            cpu[p.rs] = cpu.bus.read8(address);
            cpu.tstates += 23;
        },
        disassembly: () => `${p.rot.fname} (${p.idx} + D), ${p.rs}`
    }
}

export const bit_y_idx = (cpu: Cpu,  p: {y: number, idx: 'ix' | 'iy'}) => {
    return {
        execute: () => {
            const address = cpu[p.idx] + cpu.next8Signed();
            cpu.pc++;
            alu.bit_y(cpu, cpu.bus.read8(address), p.y);
            cpu.tstates += 20;
        },
        disassembly: () => `bit ${p.y}, ($${p.idx} + D)`
    }
}

export const res_y_idx = (cpu: Cpu, p: {y: number, idx: 'ix' | 'iy'}) => {
    return {
        execute: () => {
            const address = cpu[p.idx] + cpu.next8Signed();
            cpu.pc++;
            const result = (~(1 << p.y)) & cpu.bus.read8(address);
            cpu.bus.write8(address, result);
            cpu.tstates += 23;
        },
        disassembly: () => `res ${p.y}, ($${p.idx} + D)`
    }
}

export const ld_res_y_idx = (cpu: Cpu,  p: {y: number, rs: RegisterSingle, idx: 'ix' | 'iy'}) => {
    return {
        execute: () => {
            const address = cpu[p.idx] + cpu.next8Signed();
            cpu.pc++;
            const result = (~(1 << p.y)) & cpu.bus.read8(address);
            cpu.bus.write8(address, result);
            cpu[p.rs] = cpu.bus.read8(address);
            cpu.tstates += 23;
        },
        disassembly: () => `res ${p.y}, ($${p.idx} + D), ${p.rs}`
    }
}

export const set_y_idx = (cpu: Cpu,  p: {y: number, idx: 'ix' | 'iy'}) => {
    return {
        execute: () => {
            const address = cpu[p.idx] + cpu.next8Signed();
            cpu.pc++;
            const result = (1 << p.y) | cpu.bus.read8(address);
            cpu.bus.write8(address, result);
            cpu.tstates += 23;
        },
        disassembly: () => `set ${p.y}, ($${p.idx} + D)`
    }
}

export const ld_set_y_idx = (cpu: Cpu,  p: {y: number, rs: RegisterSingle, idx: 'ix' | 'iy'}) => {
    return {
        execute: () => {
            const address = cpu[p.idx] + cpu.next8Signed();
            cpu.pc++;
            const result = (1 << p.y) | cpu.bus.read8(address);
            cpu.bus.write8(address, result);
            cpu[p.rs] = cpu.bus.read8(address);
            cpu.tstates += 23;
        },
        disassembly: () => `set ${p.y}, ($${p.idx} + D), ${p.rs}`
    }
}

export const block_single = (cpu: Cpu, p: {bli: BlockFunction}) => {
    return {
        execute: () => {
            p.bli(cpu);
            cpu.tstates += 16;
        },
        disassembly: () => `${p.bli.fname}`
    }
}

export const block_io = (cpu: Cpu, p: {bli: BlockFunction}) => {
    return {
        execute: () => {
            p.bli(cpu);
            cpu.tstates += cpu.b === 0 ? 16 : 21;
        },
        disassembly: () => `${p.bli.fname}`
    }
}

export const block_load = (cpu: Cpu, p: {bli: BlockFunction}) => {
    return {
        execute: () => {
            p.bli(cpu);
            cpu.tstates += cpu.bc === 0 ? 16 : 21;
        },
        disassembly: () => `${p.bli.fname}`
    }
}

export const rrd = (cpu: Cpu) => {
    return {
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
            cpu.tstates += 18;
        },
        disassembly: () => 'rrd'
    }
}

export const rld = (cpu: Cpu) => {
    return {
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
            cpu.tstates += 18;
        },
        disassembly: () => 'rld'
    }
}

export const ld_a_i = (cpu: Cpu) => {
    return {
        execute: () => {
            cpu.a = cpu.i;
            cpu.flags.s = !!(cpu.a & 0x80);
            cpu.flags.z = !cpu.a;
            cpu.flags.h = false;
            cpu.flags.pv = cpu.iff2;
            cpu.flags.n = false;
            cpu.tstates += 9;
        },
        disassembly: () => 'ld a, i'
    }
}

export const ld_i_a = (cpu: Cpu) => {
    return {
        execute: () => {
            cpu.i = cpu.a;
            cpu.tstates += 9;
        },
        disassembly: () => 'ld i, a'
    }
}