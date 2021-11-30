import * as Alu from "./alu"
import { Cpu } from "./cpu"
import * as ins from "./instructions"
import { get, Instruction } from "./instructions"


export const byteRegisters = ['b', 'c', 'd', 'e', 'h', 'l', 'f', 'a', '(hl)', 'ixh', 'ixl', 'iyh', 'iyl', '(ix)', '(iy)'] as const;
export type R = typeof byteRegisters[number] | 'ix' | 'iy';
export const wordRegisters = ['pc', 'bc', 'de', 'hl', 'sp', 'af', 'ix', 'iy'] as const;
export type RP = typeof wordRegisters[number];

export type IMODE = 0 | 1 | 2 | undefined;

export interface CC {
    (cpu: Cpu): boolean,
    fname: string
}

export interface ROT {
    (cpu: Cpu, operand: number): number,
    fname: string
}

export interface ALU {
    (cpu: Cpu, operand: number): void,
    fname: string
}

export interface BLI {
    (cpu: Cpu): boolean | void,
    fname: string
}

// Tables used for decoding opcodes
const r: R[] = ['b', 'c', 'd', 'e', 'h', 'l', '(hl)', 'a'];
const rp: RP[] = ['bc', 'de', 'hl', 'sp'];
const rp2: RP[] = ['bc', 'de', 'hl', 'af'];
const alu: ALU[] = [Alu.addAcc, Alu.adcAcc, Alu.subAcc, Alu.sbcAcc, Alu.andAcc, Alu.xorAcc, Alu.orAcc, Alu.cpAcc];
const rot: ROT[] = [Alu.rlc, Alu.rrc, Alu.rl, Alu.rr, Alu.sla, Alu.sra, Alu.sll, Alu.srl];
const bli: BLI[][] = [
    [], [], [], [],
    [Alu.ldi, Alu.cpi, Alu.ini, Alu.outi],
    [Alu.ldd, Alu.cpd, Alu.ind, Alu.outd],
    [Alu.ldir, Alu.cpir, Alu.inir, Alu.otir],
    [Alu.lddr, Alu.cpdr, Alu.indr, Alu.otdr]
]
const im: IMODE[] = [0, undefined, 1, 2, 0, undefined, 1, 2];

const nz = (cpu: Cpu) => !cpu.flags.z;
nz.fname = 'nz';
const z = (cpu: Cpu) => cpu.flags.z;
z.fname = 'z';
const nc = (cpu: Cpu) => !cpu.flags.c;
nc.fname = 'nc';
const c = (cpu: Cpu) => cpu.flags.c;
c.fname = 'c';
const po = (cpu: Cpu) => !cpu.flags.pv;
po.fname = 'po';
const pe = (cpu: Cpu) => cpu.flags.pv;
pe.fname = 'pe';
const p = (cpu: Cpu) => !cpu.flags.s;
p.fname = 'p';
const m = (cpu: Cpu) => cpu.flags.s;
m.fname = 'm';

const cc: CC[] = [nz, z, nc, c, po, pe, p, m];

export const decode = (op: number, cpu: Cpu): Instruction => {
    if (op === 0xed) {
        return ed(cpu.next8(), cpu);
    }
    else if (op === 0xdd) {
        const instruction = idx(cpu.next8(), cpu, "ix");
        rp[2] = rp2[2] = 'hl';
        r[4] = 'h';
        r[5] = 'l';
        r[6] = '(hl)'
        return instruction;
    }
    else if (op === 0xed) {
        const instruction = idx(cpu.next8(), cpu, "iy");
        rp[2] = rp2[2] = 'hl';
        r[4] = 'h';
        r[5] = 'l';
        r[6] = '(hl)'
        return instruction;
    }

    const x = (op & 0xc0) >>> 6;
    const y = (op & 0x38) >>> 3; 
    const z = op & 0x07;
    const p = y >>> 1;
    const q = y % 2;

    switch (x) {
        case 0:
            switch (z) {
                case 0: 
                    if (y === 0) return get(cpu, ins.nop);
                    else if (y === 1) return get(cpu, ins.ex_af_af1);
                    else if (y === 2) return get(cpu, ins.djnz_d, cpu.next8Signed());
                    else if (y === 3) return get(cpu, ins.jr_d, cpu.next8Signed()); 
                    else if (4 <= y && y <= 7) return get(cpu, ins.jr_cc, cc[y - 4], cpu.next8Signed());
                    return get(cpu, ins.nop);
                case 1: 
                    if (q === 0) return get(cpu, ins.ld_rp_nn, rp[p], cpu.next16()); 
                    else if (q === 1) return get(cpu, ins.add_rp_rp, 'hl', rp[p]);
                    return get(cpu, ins.nop);
                case 2: {
                    if (q === 0) {
                        if (p === 0) return get(cpu, ins.ld_mem_a, 'bc');
                        else if (p === 1) return get(cpu, ins.ld_mem_a, 'de');
                        else if (p === 2) return get(cpu, ins.ld_nn_r, 'hl', cpu.next16());
                        else if (p === 3) return get(cpu, ins.ld_nn_r, 'a', cpu.next16());
                    }
                    else if (q === 1) {
                        if (p === 0) return get(cpu, ins.ld_a_mem, 'bc');
                        else if (p === 1) return get(cpu, ins.ld_a_mem, 'de'); 
                        else if (p === 2) return get(cpu, ins.ld_hl_mem_nn, cpu.next16());
                        else if (p === 3) return get(cpu, ins.ld_a_mem_nn, cpu.next16());
                    }
                    return get(cpu, ins.nop);
                }
                case 3: 
                    if (q === 0) return get(cpu, ins.inc_rp, rp[p]);
                    else if (q === 1) return get(cpu, ins.dec_rp, rp[p]);
                    return get(cpu, ins.nop);
                case 4: return get(cpu, ins.inc_r, r[y]);
                case 5: return get(cpu, ins.dec_r, r[y]);
                case 6: return get(cpu, ins.ld_r_n, r[y], cpu.next8());
                case 7: 
                    switch (y) {
                        case 0: return get(cpu, ins.rot_a, Alu.rlc);
                        case 1: return get(cpu, ins.rot_a, Alu.rrc);
                        case 2: return get(cpu, ins.rot_a, Alu.rl);
                        case 3: return get(cpu, ins.rot_a, Alu.rr);
                        case 4: return get(cpu, ins.daa);
                        case 5: return get(cpu, ins.cpl);
                        case 6: return get(cpu, ins.scf);
                        case 7: return get(cpu, ins.ccf);
                    }
                default: return get(cpu, ins.nop);
            }
        case 1: 
            if (z === 6 && y === 6) return get(cpu, ins.halt);
            return get(cpu, ins.ld_r_r, r[y], r[z]);
        case 2: return get(cpu, ins.alu_r, alu[y], r[z]);
        case 3: 
            switch (z) {
                case 0: return get(cpu, ins.ret_cc, cc[y])
                case 1: 
                    if (q === 0) return get(cpu, ins.pop_rp, rp2[p]);
                    else if (q === 1) {
                        if (p === 0) return get(cpu, ins.ret);
                        else if (p === 1) return get(cpu, ins.exx);
                        else if (p === 2) return get(cpu, ins.jp_rp, 'hl');
                        else if (p === 3) return get(cpu, ins.ld_sp_rp, 'hl');
                    }
                    return get(cpu, ins.nop);
                case 2: return get(cpu, ins.jp_cc_nn, cc[y], cpu.next16());
                case 3: {
                    switch (y) {
                        case 0: return get(cpu, ins.jp_nn, cpu.next16());
                        case 1:
                            // CB
                            op = cpu.next8();
                            const x = (op & 0xc0) >> 6;
                            const y = (op & 0x38) >>> 3; 
                            const z = op & 0x07;
                            if (x === 0) return get(cpu, ins.rot_r, rot[y], r[z]);
                            else if (x === 1) return get(cpu, ins.bit_y_r, y, r[z]);
                            else if (x === 2) return get(cpu, ins.res_y_r, y, r[z]);
                            else if (x === 3) return get(cpu, ins.set_y_r, y, r[z]);
                        case 2: return get(cpu, ins.out_n_a, cpu.next8());
                        case 3: return get(cpu, ins.in_a_n, cpu.next8());
                        case 4: return get(cpu, ins.ex_mem_sp_rp, 'hl');
                        case 5: return get(cpu, ins.ex_de_hl);
                        case 6: return get(cpu, ins.di);
                        case 7: return get(cpu, ins.ei);
                        default: return get(cpu, ins.nop);
                    }
                }
                case 4: return get(cpu, ins.call_cc_nn, cc[y], cpu.next16());
                case 5:
                    if (q === 0) return get(cpu, ins.push_rp, rp2[p]);
                    else if (q === 1) {
                        if (p === 0) return get(cpu, ins.call_nn, cpu.next16());
                    }
                    return get(cpu, ins.nop);
                case 6: return get(cpu, ins.alu_n, alu[y], cpu.next8());
                case 7: return get(cpu, ins.rst, y * 8);
                default: return get(cpu, ins.nop);
        }
        default:
            break;
    }
    return get(cpu, ins.nop);
}

const ed = (op: number, cpu: Cpu): Instruction => {
    const x = (op & 0xc0) >>> 6;
    const y = (op & 0x38) >>> 3; 
    const z = op & 0x07;
    const p = y >>> 1;
    const q = y % 2;

    if (x === 0 || x === 3) return get(cpu, ins.noni);
    else if (x === 1) {
        switch (z) {
            case 0:
                if (y === 6) return get(cpu, ins.in_c);
                else return get(cpu, ins.in_r_c, r[y]);
            case 1:
                if (y === 6) return get(cpu, ins.out_c_0);
                else return get(cpu, ins.out_c_r, r[y]);
            case 2:
                if (q === 0) return get(cpu, ins.sbc_hl_rp, rp[p]);
                else if (q === 1) return get(cpu, ins.adc_hl_rp, rp[p]);
                break;
            case 3:
                if (q === 0) return get(cpu, ins.ld_nn_rp, rp[p], cpu.next16());
                else if (q === 1) return get(cpu, ins.ld_rp_mem_nn, rp[p], cpu.next16());
                break;
            case 4: return get(cpu, ins.neg);
            case 5:
                if (y === 1) return get(cpu, ins.reti);
                else return get(cpu, ins.retn);
            case 6: return get(cpu, ins.im, im[y]);
            case 7:
                switch (y) {
                    case 0:

                }
                break;
            default:
                return get(cpu, ins.nop);
        }
    }
    else if (x === 2) return get(cpu, ins.bl_i, bli[y][z]);
    return get(cpu, ins.nop);
}


const idx = (op: number, cpu: Cpu, indexRegister: 'ix' | 'iy'): Instruction => {
    if (op === 0xdd || op === 0xed || op === 0xfd) {
        return get(cpu, ins.noni);
    }

    if (op === 0xcb) {
        const d = cpu.next8Signed();
        op = cpu.next8();

        const x = (op & 0xc0) >>> 6;
        const y = (op & 0x38) >>> 3; 
        const z = op & 0x07;
        
        const address = cpu[indexRegister] + d;
        switch (x) {
            case 0: 
                if (z != 6) return get(cpu, ins.ld_r_rot_idx, rot[y], address, r[z])
                else return get(cpu, ins.rot_idx, rot[y], address);
            case 1: return get(cpu, ins.bit_y_idx, y, address); 
            case 2:
                if (z != 6) return get(cpu, ins.ld_res_y_idx, y, address, r[z])
                else return get(cpu, ins.res_y_idx, y, address);
            case 3:
                if (z != 6) return get(cpu, ins.ld_set_y_idx, y, address, r[z])
                else return get(cpu, ins.set_y_idx, y, address);
            default:
                return get(cpu, ins.nop);
        }
    }

    rp[2] = indexRegister;
    rp2[2] = indexRegister;
    r[4] = indexRegister + 'h' as R;
    r[5] = indexRegister + 'l' as R;
    r[6] = `(${indexRegister})`

    const x = (op & 0xc0) >>> 6;
    const y = (op & 0x38) >>> 3; 
    const z = op & 0x07;
    const p = y >>> 1;
    const q = y % 2;

    switch (x) {
        case 0:
            switch (z) {
                case 1:
                    if (q === 0 && p === 2) return get(cpu, ins.ld_rp_nn, indexRegister, cpu.next16());
                    else if (q === 1) return get(cpu, ins.add_rp_rp, indexRegister, rp[p]);
                    return get(cpu, ins.nop);
                case 2:
                    if (q === 0 && p === 2) return get(cpu, ins.ld_nn_rp, indexRegister, cpu.next16());
                    else if (q === 1 && p === 2) return get(cpu, ins.ld_rp_mem_nn, indexRegister, cpu.next16());
                    return get(cpu, ins.nop);
                case 3:
                    if (q === 0 && p === 2) return get(cpu, ins.inc_rp, indexRegister);
                    else if (q === 1 && p === 2) return get(cpu, ins.dec_rp, indexRegister);
                    return get(cpu, ins.nop);
                case 4:
                    if (y === 4 || y === 5) return get(cpu, ins.idx_inc_r, r[y]);
                    else if (y === 6) return get(cpu, ins.idx_inc_r, indexRegister, cpu.next8Signed());
                    return get(cpu, ins.nop);
                case 5:
                    if (y === 4 || y === 5) return get(cpu, ins.idx_dec_r, r[y]);
                    else if (y === 6) return get(cpu, ins.idx_dec_r, indexRegister, cpu.next8Signed());
                    return get(cpu, ins.nop);
                case 6:
                    if (y === 4 || y === 5) return get(cpu, ins.idx_ld_r_n, r[y], cpu.next8());
                    else if (y === 6) return get(cpu, ins.idx_ld_r_n, indexRegister, cpu.next8(), cpu.next8Signed());
                default:
                    return get(cpu, ins.nop);
            }
        case 1:
            if (z === 6) {
                if (y === 4 || y == 5) return get(cpu, ins.idx_ld_r_r, r[y][2], indexRegister, cpu.next8Signed());
                return get(cpu, ins.idx_ld_r_r, r[y], indexRegister, cpu.next8Signed());
            }
            else if (y === 6) {
                return get(cpu, ins.idx_ld_r_r, indexRegister, r[z], cpu.next8Signed());
            }
            else if (y === 4 || y === 5 || z === 4 || z === 5) { 
                return get(cpu, ins.idx_ld_r_r, r[y], r[z]);
            }
            break;
        case 2:
            if (z === 6) return get(cpu, ins.idx_alu_r, alu[y], indexRegister, cpu.next8Signed());
            else if (z === 4 || z === 5) return get(cpu, ins.idx_alu_r, alu[y], r[z]);
            break;
        case 3:
            switch (z) {
                case 1:
                    if (q === 0 && p === 2) return get(cpu, ins.pop_rp, rp2[p]);
                    else if (q === 1 && p === 2) return get(cpu, ins.jp_rp, indexRegister);
                    else if (q === 1 && p === 3) return get(cpu, ins.ld_sp_rp, indexRegister); 
                    return get(cpu, ins.nop);
                case 3:
                    if (y === 4) return get(cpu, ins.ex_mem_sp_rp, indexRegister);
                    return get(cpu, ins.nop);
                case 5:
                    if (q === 0 && p === 2) return get(cpu, ins.push_rp, rp2[p]);
                    return get(cpu, ins.nop);
            }
        default:
            return get(cpu, ins.nop);
    }
    return get(cpu, ins.nop);
}




