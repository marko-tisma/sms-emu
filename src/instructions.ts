import * as Alu from "./alu"
import { Cpu, RegisterName } from "./cpu"
import { ALU, BLI, CC, IMODE, R, ROT, RP } from "./decoder"


export interface Instruction {
    tstates: number,
    execute: () => void,
    disassembly: string,
    address?: number
}

export const toHex = (value: number, padding: number) => {
    if (value === undefined) return;
    return value.toString(16).padStart(padding, '0');
}

export const get = (cpu: Cpu, instruction: (cpu: Cpu, ...params: any) => Instruction, ...params: any): Instruction => {
    return instruction(cpu, ...params);
}

export const nop = () => {return {tstates:4, execute: function() {}, disassembly: 'nop'}}

export const noni = (cpu: Cpu) => {
    return {
        tstates: 4,
        execute: () => {
            cpu.iff1 = false;
            cpu.iff2 = false;
            cpu.eiRequested = true;
        },
        disassembly: 'noni'
    }
}

export const ex_af_af1 = (cpu: Cpu) => {
    return {
        tstates: 4,
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
        disassembly: 'ex af af`' 
    }
}

export const djnz_d = (cpu: Cpu, d: number) => {
    return {
        tstates: cpu.b - 1 > 0 ? 13 : 7,
        execute: () => {
            cpu.b--;
            if (cpu.b != 0) {
                cpu.pc += d; 
            }
        },
        disassembly: `djnz $$${toHex(cpu.pc + d, 2)}`
    }
}

export const jr_d = (cpu: Cpu, d: number) => {
    return {
        tstates: 12,
        execute: () => {
            cpu.pc += d; 
        },
        disassembly: `jr $${toHex(cpu.pc + d, 2)}`
    }
}

export const jr_cc = (cpu: Cpu, cc: CC, d: number) => {
    return {
        tstates: cc(cpu) ? 12 : 7,
        execute: () => {
            cpu.pc += d;
        },
        disassembly: `jr ${cc.fname}, $${toHex(cpu.pc + d, 2)}`
    }
}

export const ld_rp_nn = (cpu: Cpu, rp: RP, nn: number) => {
    return {
        tstates: rp === 'ix' || rp === 'iy' ? 14 : 10,
        execute: () => {
            cpu[rp] = nn;
        },
        disassembly: `ld ${rp}, $${toHex(nn, 4)}`
    }
}

export const add_rp_rp = (cpu: Cpu, dst: RP, src: RP) => {
    return {
        tstates: dst === 'ix' || dst === 'iy' ? 15 : 11,
        execute: () => {
            cpu[dst] = Alu.add16(cpu, cpu[dst], cpu[src]);
        },
        disassembly: `add ${dst}, ${src}`
    }
}

export const ld_mem_a = (cpu: Cpu, dst: RP) => {
    return {
        tstates: 7,
        execute: () => {
            cpu.memory.write8(cpu[dst], cpu.a);
        },
        disassembly: `ld (${dst}), a`
    }
}

export const ld_nn_r = (cpu: Cpu, src: R, nn: number) => {
    return {
        tstates: src.length === 1 ? 13 : 16,
        execute: () => {
            src.length === 1 ? cpu.memory.write8(nn, cpu[src]): cpu.memory.write16(nn, cpu[src])
        },
        disassembly: `ld ($${toHex(nn, 4)}), src`
    }
}

export const ld_a_mem = (cpu: Cpu, src: R) => {
    return {
        tstates: 7,
        execute: () => {
            cpu.a = cpu.memory.read8(cpu[src]);
        },
        disassembly: `ld a, (${src})`
    }
}


export const ld_hl_mem_nn = (cpu: Cpu, nn: number) => {
    return {
        tstates: 16,
        execute: () => {
            cpu.hl = cpu.memory.read16(nn);
        },
        disassembly: `ld hl, ($${toHex(nn, 4)})`
    }
}

export const ld_a_mem_nn = (cpu: Cpu, nn: number) => {
    return {
        tstates: 13,
        execute: () => {
            cpu.a = cpu.memory.read8(nn);
        },
        disassembly: `ld a, ($${toHex(nn, 4)})`
    }
}

export const inc_rp = (cpu: Cpu, rp: RP) => {
    return {
        tstates: rp === 'ix' || rp === 'iy' ? 10 : 6,
        execute: () => {
            cpu[rp]++;
        },
        disassembly: `inc ${rp}`
    }
}

export const dec_rp = (cpu: Cpu, rp: RP) => {
    return {
        tstates: rp === 'ix' || rp === 'iy' ? 10 : 6,
        execute: () => {
            cpu[rp]--;
        },
        disassembly: `dec ${rp}`
    }
}

export const inc_r = (cpu: Cpu, r: R) => {
    return {
        tstates: 4,
        execute: () => {
            cpu[r] = Alu.inc8(cpu, cpu[r]);
        },
        disassembly: `inc ${r}`
    }
}

export const dec_r = (cpu: Cpu, r: R) => {
    return {
        tstates: 4,
        execute: () => {
            cpu[r] = Alu.dec8(cpu, cpu[r])
        },
        disassembly: `dec ${r}`
    }
}

export const ld_r_n = (cpu: Cpu, r: R, n: number) => {
    return {
        tstates: 7,
        execute: () => {
            cpu[r] = n;
        },
        disassembly: `ld ${r}, $${toHex(n, 2)}`
    }
}

export const rot_a = (cpu: Cpu, rot: ROT) => {
    return {
        tstates: 4,
        execute: () => {
            cpu.a = rot(cpu, cpu.a);
        },
        disassembly: `${rot.fname}a`
    }
}

export const daa = (cpu: Cpu) => {
    return {
        tstates: 4,
        execute: () => Alu.daa(cpu),
        disassembly: 'daa'
    }
}

export const cpl = (cpu: Cpu) => {
    return {
        tstates: 4,
        execute: () => {
            cpu.a = ~cpu.a;
            cpu.flags.h = true;
            cpu.flags.n = true;
        },
        disassembly: 'cpl'
    }
}

export const scf = (cpu: Cpu) => {
    return {
        tstates: 4,
        execute: () => {
            cpu.flags.c = true;
            cpu.flags.h = false;
            cpu.flags.n = false;
        },
        disassembly: 'scf'
    }
}

export const ccf = (cpu: Cpu) => {
    return {
        tstates: 4,
        execute: () => {
            cpu.flags.c = !cpu.flags.c;
            cpu.flags.h = cpu.flags.c;
            cpu.flags.n = false;
        },
        disassembly: 'ccf'
    }
}

export const halt = (cpu: Cpu) => {
    return {
        tstates: 4,
        execute: () => {
            cpu.halted = true;
        },
        disassembly: 'halt'
    }
}

export const ld_r_r = (cpu: Cpu, dst: R, src: R) => {
    return {
        tstates: (dst === '(hl)' || src === '(hl)') ? 7 : 4,
        execute: () => {
            cpu[dst] = cpu[src];
        },
        disassembly: `ld ${dst}, ${src}`
    }
}


export const idx_inc_r = (cpu: Cpu, dst: R, d?: number) => {
    return {
        tstates: d ? 23 : 8,
        execute: () => {
            if (d) {
                cpu.memory.write8(cpu[dst] + d, Alu.inc8(cpu, cpu.memory.read8(cpu[dst] + d)));
            }
            else {
                cpu[dst] = Alu.inc8(cpu, cpu[dst]); 
            }
        },
        disassembly: d ? `inc (${dst} + ${d})`: `inc ${dst}`
    }
}

export const idx_dec_r = (cpu: Cpu, dst: R, d?: number) => {
    return {
        tstates: d ? 23 : 8,
        execute: () => {
            if (d) {
                cpu.memory.write8(cpu[dst] + d, Alu.dec8(cpu, cpu.memory.read8(cpu[dst] + d)));
            }
            else {
                cpu[dst] = Alu.dec8(cpu, cpu[dst]); 
            }
        },
        disassembly: d ? `dec (${dst} + ${d})`: `dec ${dst}`
    }
}


export const idx_ld_r_n = (cpu: Cpu, dst: R, n: number, d?: number) => {
    return {
        tstates: d ? 19 : 11,
        execute: () => {
            if(d) cpu.memory.write8(cpu[dst] + d, n);
            else cpu[dst] = n;
        },
        disassembly: d ? `ld (${dst} + ${d}), ${n}`: `ld ${dst}, ${n}`
    }
}

export const idx_ld_r_r = (cpu: Cpu, dst: R, src: R, d?: number) => {
    let disassembly = '';
    if (d) {
        if (src === 'ix' || src == 'iy') {
            disassembly = `ld ${dst}, (${src} + ${toHex(d, 2)})`;
        }
        else disassembly = `ld (${dst} + ${toHex(d, 2)}), ${src}`;
    }
    else disassembly = `ld ${dst}, ${src}`;
    return {
        tstates: d ? 19 : 8,
        execute: () => {
            if (d) {
                if (src === 'ix' || src === 'iy') {
                    cpu[dst] = cpu.memory.read8(cpu[src] + d);
                }
                else {
                    cpu.memory.write8(cpu[dst] + d, cpu[src]);
                }
            }
            else {
                cpu[dst] = cpu[src];
            }
        },
        disassembly: disassembly
    }
}

export const idx_alu_r = (cpu: Cpu, alu: ALU, r: R, d?: number) => {
    return {
        tstates: d ? 19 : 8,
        execute: () => {
            if (d) alu(cpu, cpu.memory.read8(cpu[r] + d));
            else alu(cpu, cpu[r]);
        },
        disassembly: `${alu.fname} ${r}`
    }
}

export const alu_r = (cpu: Cpu, alu: ALU, r: R) => {
    return {
        tstates: r === '(hl)' ? 7: 4,
        execute: () => alu(cpu, cpu[r]),
        disassembly: `${alu.fname} ${r}`
    }
}

export const ret_cc = (cpu: Cpu, cc: CC) => {
    return {
        tstates: cc(cpu) ? 11 : 5,
        execute: () => {
            if (cc(cpu)) {
                cpu.pc = cpu.pop16();
            }
        },
        disassembly: `ret ${cc.fname}`
    }
}

export const pop_rp = (cpu: Cpu, rp: RP) => {
    return {
        tstates: rp === 'ix' || rp === 'iy' ? 14 : 10,
        execute: () => {
            cpu[rp] = cpu.pop16();
        },
        disassembly: `pop ${rp}`
    }
}

export const ret = (cpu: Cpu) => {
    return {
        tstates: 10,
        execute: () => {
            cpu.pc = cpu.pop16();
        },
        disassembly: 'ret'
    }
}

export const exx = (cpu: Cpu) => {
    return {
        tstates: 4,
        execute: () => {
            const tmp = cpu.registers;
            cpu.registers = cpu.shadowRegisters;
            cpu.shadowRegisters = tmp;

            const tmpFlags = cpu.flags;
            cpu.flags = cpu.shadowFlags;
            cpu.shadowFlags = tmpFlags;
        },
        disassembly: 'exx'
    }
}

export const jp_rp = (cpu: Cpu, rp: RP) => {
    return {
        tstates: rp === 'ix' || rp === 'iy' ? 8 : 4,
        execute: () => {
            cpu.pc = cpu[rp];
        },
        disassembly: `jp ${rp}`
    }
}

export const ld_sp_rp = (cpu: Cpu, rp: RP) => {
    return {
        tstates: rp === 'ix' || rp === 'iy' ? 10: 6,
        execute: () => {
            cpu.sp = cpu[rp];
        },
        disassembly: `ld sp, ${rp}`
    }
}

export const jp_cc_nn = (cpu: Cpu, cc: CC, nn: number) => {
    return {
        tstates: 10,
        execute: () => {
            if (cc(cpu)) {
                cpu.pc = nn;
            }
        },
        disassembly: `jp ${cc.fname}, $${toHex(nn, 4)}`
    }
}

export const jp_nn = (cpu: Cpu, nn: number) => {
    return {
        tstates: 10,
        execute: () => {
            cpu.pc = nn;
        },
        disassembly: `jp $${toHex(nn, 4)}`
    }
}

export const rot_r = (cpu: Cpu, rot: ROT, r: R) => {
    return {
        tstates: r === '(hl)' ? 15 : 8,
        execute: () => {
            cpu[r] = rot(cpu, cpu[r]);
        },
        disassembly: `${rot.fname} ${r}`
    }
}

export const bit_y_r = (cpu: Cpu, y: number, r: R) => {
    return {
        tstates: 8,
        execute: () => {
            const mask = 1 << y;
            cpu.flags.z = !(mask & cpu[r])
            cpu.flags.h = true;
            cpu.flags.n = false;
        },
        disassembly: `bit $${toHex(y, 2)} ${r}`
    }
}

export const res_y_r = (cpu: Cpu, y: number, r: R) => {
    return {
        tstates: 8,
        execute: () => {
            const mask = 1 << y;
            cpu[r] &= (~mask);
        },
        disassembly: `res $${toHex(y, 2)} ${r}`
    }
}

export const set_y_r = (cpu: Cpu, y: number, r: R) => {
    return {
        tstates: 8,
        execute: () => {
            cpu[r] |= 1 << y;
        },
        disassembly: `set $${toHex(y, 2)} ${r}`
    }
}

export const out_n_a = (cpu: Cpu, n: number) => {
    return {
        tstates: 11,
        execute: () => {
            cpu.memory.out(n, cpu.a);
        },
        disassembly: `out $${toHex(n, 2)}, a`
    }
}

export const in_a_n = (cpu: Cpu, n: number) => {
    return {
        tstates: 11,
        execute: () => {
            cpu.a = cpu.memory.in(n);
        },
        disassembly: `in a, ($${toHex(n, 2)})`
    }
}

export const ex_mem_sp_rp = (cpu: Cpu, rp: RP) => {
    return {
        tstates: rp === 'ix' || rp === 'iy' ? 23: 19,
        execute: () => {
            let tmp = cpu.memory.read16(cpu.sp);
            cpu.memory.write16(cpu.sp, cpu[rp]);
            cpu[rp] = tmp;
        },
        disassembly: `ex (sp), ${rp}`
    }
}

export const ex_de_hl = (cpu: Cpu) => {
    return {
        tstates: 4,
        execute: () => {
            const tmpDe = cpu.de;
            cpu.de = cpu.hl;
            cpu.hl = tmpDe;
        },
        disassembly: 'ex de, hl'
    }
}

export const di = (cpu: Cpu) => {
    return {
        tstates: 4,
        execute: () => {
            cpu.iff1 = false;
            cpu.iff2 = false;
        },
        disassembly: 'di'
    }
}

export const ei = (cpu: Cpu) => {
    return {
        tstates: 4,
        execute: () => {
            cpu.eiRequested = true;
    },
        disassembly: 'ei'
    }
}

export const push_rp = (cpu: Cpu, rp: RP) => {
    return {
        tstates: rp === 'ix' || rp === 'iy' ? 15 : 11,
        execute: () => {
            cpu.push16(cpu[rp]);
        },
        disassembly: `push ${rp}`
    }
}

export const call_nn = (cpu: Cpu, nn: number) => {
    return {
        tstates: 17,
        execute: () => {
            cpu.push16(cpu.pc);
            cpu.pc = nn;
        },
        disassembly: `call $${toHex(nn, 4)}`
    }
}

export const call_cc_nn = (cpu: Cpu, cc: CC, nn: number) => {
    return {
        tstates: cc(cpu) ? 17 : 10,
        execute: () => {
            if (cc(cpu)) {
                cpu.push16(cpu.pc);
                cpu.pc = nn; 
            }
        },
        disassembly: `call ${cc.fname}, $${toHex(nn, 4)}`
    }
}

export const alu_n = (cpu: Cpu, alu: ALU, n: number) => {
    return {
        tstates: 7,
        execute: () => {
            alu(cpu, n);
        },
        disassembly: `${alu.fname} $${toHex(n, 2)}`
    }
}

export const rst = (cpu: Cpu, address: number) => {
    return {
        tstates: 11,
        execute: () => {
            cpu.push16(cpu.pc);
            cpu.pc = address;
        },
        disassembly: `RST $${toHex(address, 4)}`
    }
}

export const in_c = (cpu: Cpu) => {
    return {
        tstates: 12,
        execute: () => {
            Alu.io_in(cpu, cpu.c);
        },
        disassembly: 'in (c)'
    }
}

export const in_r_c = (cpu: Cpu, r: R) => {
    return {
        tstates: 12,
        execute: () => {
            cpu[r] = Alu.io_in(cpu, cpu.c);
        },
        disassembly: `in ${r}, (c)`
    }
}

export const out_c_0 = (cpu: Cpu) => {
    return {
        tstates: 12,
        execute: () => {
            cpu.memory.out(cpu.c, 0);
        },
        disassembly: 'out (c), 0'
    }
}

export const out_c_r = (cpu: Cpu, r: R) => {
    return {
        tstates: 12,
        execute: () => {
            cpu.memory.out(cpu.c, cpu[r]);
        },
        disassembly: `out (c), ${r}`
    }
}

export const sbc_hl_rp = (cpu: Cpu, rp: RP) => {
    return {
        tstates: 15,
        execute: () => {
            cpu.hl = Alu.sbc16(cpu, cpu.hl, cpu[rp]);
        },
        disassembly: `sbc hl, ${rp}`
    }
}

export const adc_hl_rp = (cpu: Cpu, rp: RP) => {
    return {
        tstates: 15,
        execute: () => {
            cpu.hl = Alu.adc16(cpu, cpu.hl, cpu[rp]);
        },
        disassembly: `adc hl, ${rp}`
    }
}

export const ld_nn_rp = (cpu: Cpu, rp: RP, nn: number) => {
    return {
        tstates: 20,
        execute: () => {
            cpu.memory.write16(nn, cpu[rp]);
        },
        disassembly: `ld ($${toHex(nn, 4)}), ${rp}`
    }
}

export const ld_rp_mem_nn = (cpu: Cpu, rp: RP, nn: number) => {
    return {
        tstates: 20,
        execute: () => {
            cpu[rp] = cpu.memory.read16(nn);
        },
        disassembly: `ld ${rp}, ($${toHex(nn, 4)})`
    }
}

export const neg = (cpu: Cpu) => {
    return {
        tstates: 8,
        execute: () => {
            cpu.a = ~cpu.a;
        },
        disassembly: 'neg'
    }
}

export const reti = (cpu: Cpu) => {
    return {
        tstates: 14,
        execute: () => {
            cpu.pc = cpu.pop16();
        },
        disassembly: 'reti'
    }
}

export const retn = (cpu: Cpu) => {
    return {
        tstates: 14,
        execute: () => {
            cpu.pc = cpu.pop16();
            cpu.iff1 = cpu.iff2;
        },
        disassembly: 'retn'
    }
}

export const im = (cpu: Cpu, imode: IMODE) => {
    return {
        tstates: 8,
        execute: () => {
            cpu.interruptMode = imode;
        },
        disassembly: imode === undefined ? 'im 0/1' : `im ${imode}`
    }
}

export const rot_idx = (cpu: Cpu, rot: ROT, address: number) => {
    return {
        tstates: 23,
        execute: () => {
            cpu.memory.write8(address, rot(cpu, cpu.memory.read8(address)));
       },
        disassembly: `${rot.fname} ($${toHex(address, 4)})`
    }
}

export const ld_r_rot_idx = (cpu: Cpu, rot: ROT, address: number, r: R) => {
    return {
        tstates: 23,
        execute: () => {
            cpu.memory.write8(address, rot(cpu, cpu.memory.read8(address)));
            cpu[r] = cpu.memory.read8(address);
        },
        disassembly: `${rot.fname} ($${toHex(address, 4)}), ${r}`
    }
}

export const bit_y_idx = (cpu: Cpu,  y: number, address: number) => {
    return {
        tstates: 20,
        execute: () => {
            const mask = 1 << y;
            cpu.flags.z = !(mask & cpu.memory.read8(address));
            cpu.flags.h = true;
            cpu.flags.n = false;
        },
        disassembly: `bit $${toHex(y, 2)}, ($${toHex(address, 4)})`
    }
}

export const res_y_idx = (cpu: Cpu,  y: number, address: number) => {
    return {
        tstates: 23,
        execute: () => {
            const m = 1 << y;
            const result = (~m) & cpu.memory.read8(address);
            cpu.memory.write8(address, result);
        },
        disassembly: `res $${toHex(y, 2)}, ($${toHex(address, 4)})`
    }
}

export const ld_res_y_idx = (cpu: Cpu,  y: number, address: number, r: R) => {
    return {
        tstates: 23,
        execute: () => {
            res_y_idx(cpu, y, address).execute();
            cpu[r] = cpu.memory.read8(address);
        },
        disassembly: `res $${toHex(y, 2)}, ($${toHex(address, 4)}), ${r}`
    }
}

export const set_y_idx = (cpu: Cpu,  y: number, address: number) => {
    return {
        tstates: 23,
        execute: () => {
            const m = 1 << y;
            const result = m | cpu.memory.read8(address);
            cpu.memory.write8(address, result);
        },
        disassembly: `set $${toHex(y, 2)}, ($${toHex(address, 4)})`
    }
}

export const ld_set_y_idx = (cpu: Cpu,  y: number, address: number, r: R) => {
    return {
        tstates: 23,
        execute: () => {
            set_y_idx(cpu, y, address).execute();
            cpu[r] = cpu.memory.read8(address);
        },
        disassembly: `set $${toHex(y, 2)}, ($${toHex(address, 4)}), ${r}`
    }
}

export const bl_i = (cpu: Cpu, bli: BLI) => {
    return {
        tstates: bli.fname.endsWith('r') && cpu.b === 1 ? 21 : 16,
        execute: () => { bli(cpu) },
        disassembly: `${bli.fname}`
    }
}
