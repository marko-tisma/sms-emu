import * as Alu from "./alu";
import { Cpu, Flag } from "./cpu";
import { get, Instruction } from "./instructions";
import * as ins from "./instructions"

export type R = 'b' | 'c' | 'd' | 'e' | 'h' | 'l' | 'a' | '_hl_' | 'ixh' | 'ixl' | 'iyh' | 'iyl';
export type RP = 'bc' | 'de' | 'hl' | 'sp' | 'af' | 'ix' | 'iy';

// Tables used for decoding opcodes
const r: R[] = ['b', 'c', 'd', 'e', 'h', 'l', '_hl_', 'a'];
const rp: RP[] = ['bc', 'de', 'hl', 'sp'];
const rp2: RP[] = ['bc', 'de', 'hl', 'af'];
const alu = [Alu.addAcc, Alu.adcAcc, Alu.subAcc, Alu.sbcAcc, Alu.andAcc, Alu.xorAcc, Alu.orAcc, Alu.cpAcc];
const rot = [Alu.rlc, Alu.rrc, Alu.rl, Alu.rr, Alu.sla, Alu.sra, Alu.sll, Alu.srl];
const bli = [
    [], [], [], [],
    [Alu.ldi, Alu.cpi, Alu.ini, Alu.outi],
    [Alu.ldd, Alu.cpd, Alu.ind, Alu.outd],
    [Alu.ldir, Alu.cpir, Alu.inir, Alu.otir],
    [Alu.lddr, Alu.cpdr, Alu.indr, Alu.otdr]
]

const nz = (cpu: Cpu) => !cpu.getFlag(Flag.ZERO);
const z = (cpu: Cpu) => cpu.getFlag(Flag.ZERO);
const nc = (cpu: Cpu) => !cpu.getFlag(Flag.CARRY);
const c = (cpu: Cpu) => cpu.getFlag(Flag.CARRY);
const po = (cpu: Cpu) => !cpu.getFlag(Flag.PARITY_OVERFLOW);
const pe = (cpu: Cpu) => cpu.getFlag(Flag.PARITY_OVERFLOW);
const p = (cpu: Cpu) => !cpu.getFlag(Flag.SIGN);
const m = (cpu: Cpu) => cpu.getFlag(Flag.SIGN);
const cc = [nz, z, nc, c, po, pe, p, m];

export const decode = (op: number, cpu: Cpu): Instruction => {
    if (op === 0xed) {
        return ed(cpu.next8(), cpu);
    }
    else if (op === 0xdd) {
        const instruction = idx(cpu.next8(), cpu, "ix");
        rp[2] = rp2[2] = 'hl';
        r[4] = 'h';
        r[5] = 'l';
        return instruction;
    }
    else if (op === 0xed) {
        const instruction = idx(cpu.next8(), cpu, "iy");
        rp[2] = rp2[2] = 'hl';
        r[4] = 'h';
        r[5] = 'l';
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
                    if (y === 0) return get(ins.nop);
                    else if (y === 1) return get(ins.ex_af_af1);
                    else if (y === 2) return get(ins.djnz_d);
                    else if (y === 3) return get(ins.jr_d); 
                    else if (4 <= y && y <= 7) return get(ins.jr_cc, cc[y - 4]);
                    return get(ins.nop);
                case 1: 
                    if (q === 0) return get(ins.ld_rp_nn, rp[p]); 
                    else if (q === 1) return get(ins.add_rp_rp, 'hl', rp[p]);
                    return get(ins.nop);
                case 2: {
                    if (q === 0) {
                        if (p === 0) return get(ins.ld_mem_a, 'bc');
                        else if (p === 1) return get(ins.ld_mem_a, 'de');
                        else if (p === 2) return get(ins.ld_nn_r, 'hl');
                        else if (p === 3) return get(ins.ld_nn_r, 'a');
                    }
                    else if (q === 1) {
                        if (p === 0) return get(ins.ld_a_mem, 'bc');
                        else if (p === 1) return get(ins.ld_a_mem, 'de'); 
                        else if (p === 2) return get(ins.ld_hl_mem_nn);
                        else if (p === 3) return get(ins.ld_a_mem_nn);
                    }
                    return get(ins.nop);
                }
                case 3: 
                    if (q === 0) return get(ins.inc_rp, rp[p]);
                    else if (q === 1) return get(ins.dec_rp, rp[p]);
                    return get(ins.nop);
                case 4: return get(ins.inc_r, r[y]);
                case 5: return get(ins.dec_r, r[y]);
                case 6: return get(ins.ld_r_n, r[y]);
                case 7: 
                    switch (y) {
                        case 0: return get(ins.rlca);
                        case 1: return get(ins.rrca);
                        case 2: return get(ins.rla);
                        case 3: return get(ins.rra);
                        case 4: return get(ins.daa);
                        case 5: return get(ins.cpl);
                        case 6: return get(ins.scf);
                        case 7: return get(ins.ccf);
                    }
                default: return get(ins.nop);
            }
        case 1: 
            if (z === 6 && y === 6) return get(ins.halt);
            return get(ins.ld_r_r, r[y], r[z]);
        case 2: return get(ins.alu_r, alu[y], r[z]);
        case 3: 
            switch (z) {
                case 0: return get(ins.ret_cc, cc[y])
                case 1: 
                    if (q === 0) return get(ins.pop_rp, rp2[p]);
                    else if (q === 1) {
                        if (p === 0) return get(ins.ret);
                        else if (p === 1) return get(ins.exx);
                        else if (p === 2) return get(ins.jp_rp, 'hl');
                        else if (p === 3) return get(ins.ld_sp_rp, 'hl');
                    }
                    return get(ins.nop);
                case 2: return get(ins.jp_cc_nn, cc[y]);
                case 3: {
                    switch (y) {
                        case 0: return get(ins.jp_nn);
                        case 1:
                            // CB
                            op = cpu.next8();
                            const x = (op & 0xc0) >> 6;
                            const y = (op & 0x38) >>> 3; 
                            const z = op & 0x07;
                            if (x === 0) return get(ins.rot_r, rot[y], r[z]);
                            else if (x === 1) return get(ins.bit_y_r, y, r[z]);
                            else if (x === 2) return get(ins.res_y_r, y, r[z]);
                            else if (x === 3) return get(ins.set_y_r, y, r[z]);
                        case 2: return get(ins.out_n_a);
                        case 3: return get(ins.in_a_n);
                        case 4: return get(ins.ex_mem_sp_rp, 'hl');
                        case 5: return get(ins.ex_de_hl);
                        case 6: return get(ins.di);
                        case 7: return get(ins.ei);
                        default: return get(ins.nop);
                    }
                }
                case 4: return get(ins.call_cc_nn, cc[y]);
                case 5:
                    if (q === 0) return get(ins.push_rp, rp2[p]);
                    else if (q === 1) {
                        if (p === 0) return get(ins.call_nn);
                    }
                    return get(ins.nop);
                case 6: return get(ins.alu_n, alu[y]);
                case 7: return get(ins.rst, y * 8);
                default: return get(ins.nop);
        }
        default:
            break;
    }
    return get(ins.nop);
}

const ed = (op: number, cpu: Cpu): Instruction => {
    const x = (op & 0xc0) >>> 6;
    const y = (op & 0x38) >>> 3; 
    const z = op & 0x07;
    const p = y >>> 1;
    const q = y % 2;

    if (x === 0 || x === 3) return get(ins.noni);
    else if (x === 1) {
        switch (z) {
            case 0:
                if (y === 6) return get(ins.in_c);
                else return get(ins.in_r_c, r[y]);
            case 1:
                if (y === 6) return get(ins.out_c_0);
                else return get(ins.out_c_r, r[y]);
            case 2:
                if (q === 0) return get(ins.sbc_hl_rp, rp[p]);
                else if (q === 1) return get(ins.adc_hl_rp, rp[p]);
                break;
            case 3:
                if (q === 0) return get(ins.ld_nn_rp, rp[p]);
                else if (q === 1) return get(ins.ld_rp_mem_nn, rp[p]);
                break;
            case 4: return get(ins.neg);
            case 5:
                if (y === 1) return get(ins.reti);
                else return get(ins.retn);
            case 6:
                // IM
                break;
            case 7:
                switch (y) {
                    case 0:

                }
                break;
            default:
                return get(ins.nop);
        }
    }
    else if (x === 2) return get(ins.bl_i, bli[y][z]);
    return get(ins.nop);
}


const idx = (op: number, cpu: Cpu, indexRegister: 'ix' | 'iy'): Instruction => {
    if (op === 0xdd || op === 0xed || op === 0xfd) {
        return get(ins.noni);
    }

    if (op === 0xcb) {
        const d = ins.toSignedByte(cpu.next8());
        op = cpu.next8();

        const x = (op & 0xc0) >>> 6;
        const y = (op & 0x38) >>> 3; 
        const z = op & 0x07;
        
        const address = cpu[indexRegister] + d;
        switch (x) {
            case 0: 
                if (z != 6) return get(ins.ld_r_rot_idx, rot[y], address, r[z])
                else return get(ins.rot_idx, rot[y], address);
            case 1: return get(ins.bit_y_idx, y, address); 
            case 2:
                if (z != 6) return get(ins.ld_res_y_idx, y, address, r[z])
                else return get(ins.res_y_idx, y, address);
            case 3:
                if (z != 6) return get(ins.ld_set_y_idx, y, address, r[z])
                else return get(ins.set_y_idx, y, address);
            default:
                return get(ins.nop);
        }
    }

    rp[2] = indexRegister;
    rp2[2] = indexRegister;
    r[4] = indexRegister + 'h' as R;
    r[5] = indexRegister + 'l' as R;

    const x = (op & 0xc0) >>> 6;
    const y = (op & 0x38) >>> 3; 
    const z = op & 0x07;
    const p = y >>> 1;
    const q = y % 2;

    switch (x) {
        case 0:
            switch (z) {
                case 1:
                    if (q === 0 && p === 2) return get(ins.ld_rp_nn, indexRegister);
                    else if (q === 1) return get(ins.add_rp_rp, indexRegister, rp[p]);
                    return get(ins.nop);
                case 2:
                    if (q === 0 && p === 2) return get(ins.ld_nn_rp, indexRegister);
                    else if (q === 1 && p === 2) return get(ins.ld_rp_mem_nn, indexRegister);
                    return get(ins.nop);
                case 3:
                    if (q === 0 && p === 2) return get(ins.inc_rp, indexRegister);
                    else if (q === 1 && p === 2) return get(ins.dec_rp, indexRegister);
                    return get(ins.nop);
                case 4:
                    if (y === 4 || y === 5) return get(ins.inc_r, r[y]);
                    return get(ins.nop);
                case 5:
                    if (y === 4 || y === 5) return get(ins.dec_r, r[y]);
                    return get(ins.nop);
                case 6:
                    if (y === 4 || y === 5) return get(ins.ld_r_n, r[y]);
                default:
                    return get(ins.nop);
            }
        case 1:
            if (y === 4 || y === 5 || z === 4 || z === 5) return get(ins.ld_r_r, r[y], r[z]);
            break;
        case 2:
            if (z === 4 || z === 5) return get(ins.alu_r, alu[y], r[z]);
            break;
        case 3:
            switch (z) {
                case 1:
                    if (q === 0 && p === 2) return get(ins.pop_rp, rp[p]);
                    else if (q === 1 && p === 2) return get(ins.jp_rp, indexRegister);
                    else if (q === 1 && p === 3) return get(ins.ld_sp_rp, indexRegister); 
                    return get(ins.nop);
                case 3:
                    if (y === 4) return get(ins.ex_mem_sp_rp, indexRegister);
                    return get(ins.nop);
                case 5:
                    if (q === 0 && p === 2) return get(ins.push_rp, rp[p]);
                    return get(ins.nop);
            }
        default:
            return get(ins.nop);
    }
    return get(ins.nop);
}




