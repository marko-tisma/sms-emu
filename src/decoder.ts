import * as alu from "./alu";
import { Cpu } from "./cpu";
import * as ins from "./instructions";
import { get } from "./instructions";

export const singleRegisters = [
    'b', 'c', 'd', 'e', 'h', 'l', 'f', 'a', 'ixh', 'ixl', 'iyh', 'iyl'
] as const;
export type RegisterSingle = typeof singleRegisters[number] | '(hl)' | '(ix + D)' | '(iy + D)';

export const registerPairs = [
    'af', 'bc', 'de', 'hl', 'pc', 'sp', 'ix', 'iy'
] as const;
export type RegisterPair = typeof registerPairs[number];

export type InterruptMode = 0 | 1 | 2 | undefined;
export interface ConditionalFunction {
    (cpu: Cpu): boolean,
    fname: string
}
export interface RotateFunction {
    (cpu: Cpu, operand: number): number,
    fname: string
}
export interface AccumulatorFunction {
    (cpu: Cpu, operand: number): void,
    fname: string
}
export interface BlockFunction {
    (cpu: Cpu): boolean | void,
    fname: string
}

type Param =
    RegisterSingle | RegisterPair | AccumulatorFunction | BlockFunction
    | ConditionalFunction | RotateFunction | InterruptMode | number;

export interface Params {
    [key: string]: Param,
}

export interface Instruction {
    execute: () => void,
    disassembly: () => string,
    address?: number
}

export interface Decoded {
    instructionConstructor: (cpu: Cpu, params?: Params) => Instruction,
    params?: Params
}

// Tables used for decoding opcodes
const rs: RegisterSingle[] = ['b', 'c', 'd', 'e', 'h', 'l', '(hl)', 'a'];
const rp: RegisterPair[] = ['bc', 'de', 'hl', 'sp'];
const rp2: RegisterPair[] = ['bc', 'de', 'hl', 'af'];
const acc: AccumulatorFunction[] = [
    alu.addAcc, alu.adcAcc, alu.subAcc, alu.sbcAcc,
    alu.andAcc, alu.xorAcc, alu.orAcc, alu.cpAcc
];
const rot: RotateFunction[] = [
    alu.rlc, alu.rrc, alu.rl, alu.rr, alu.sla, alu.sra, alu.sll, alu.srl
];
const bli: BlockFunction[][] = [
    [], [], [], [],
    [alu.ldi, alu.cpi, alu.ini, alu.outi],
    [alu.ldd, alu.cpd, alu.ind, alu.outd],
    [alu.ldir, alu.cpir, alu.inir, alu.otir],
    [alu.lddr, alu.cpdr, alu.indr, alu.otdr]
]
const im: InterruptMode[] = [0, undefined, 1, 2, 0, undefined, 1, 2];

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

const cc: ConditionalFunction[] = [nz, z, nc, c, po, pe, p, m];

export const decode = (op: number, cpu: Cpu): Decoded => {
    switch (op) {
        case 0xed: return decodeEd(cpu.next8());
        case 0xcb: return decodeCb(cpu.next8());
        case 0xdd: {
            op = cpu.next8();
            if (op === 0xfd || op === 0xdd) {
                cpu.tstates += 4;
                cpu.pc--;
                return get(ins.nop);
            }
            if (op === 0xcb) return decodeIdxcb(cpu.bus.read8(cpu.pc + 1), 'ix');
            const decoded = decodeIdx(op, 'ix');
            cpu.tstates += calculateExtraTstates(decoded);
            return decoded;
        }
        case 0xfd: {
            op = cpu.next8();
            if (op === 0xfd || op === 0xdd) {
                cpu.tstates += 4;
                cpu.pc--;
                return get(ins.nop);
            }
            if (op === 0xcb) return decodeIdxcb(cpu.bus.read8(cpu.pc + 1), 'iy');
            const decoded = decodeIdx(op, 'iy');
            cpu.tstates += calculateExtraTstates(decoded);
            return decoded;
        }
        default: return decodeBase(op);
    }
}

// Need to add extra tstates to index instructions because they use the same 
// decoder as the base instructions
export const calculateExtraTstates = ({ params }: Decoded): number => {
    let tstatesToAdd = 0;
    if (params) {
        ['src', 'dst', 'rp', 'rs'].map(p => {
            if (params[p]) {
                if ((params[p] as string).startsWith('i')) tstatesToAdd = 4;
                if ((params[p] as string).startsWith('(i')) tstatesToAdd = 12;
            }
        });
    }
    return tstatesToAdd;
}

export const decodeBase = (op: number): Decoded => {
    const [x, y, z, p, q] = opPatterns(op);
    switch (x) {
        case 0:
            switch (z) {
                case 0:
                    if (y === 0) return get(ins.nop);
                    if (y === 1) return get(ins.ex_af_af1);
                    if (y === 2) return get(ins.djnz_d);
                    if (y === 3) return get(ins.jr_d);
                    if (4 <= y && y <= 7) return get(ins.jr_cc, { cc: cc[y - 4] });
                    return get(ins.nop);
                case 1:
                    if (q === 0) return get(ins.ld_rp_nn, { rp: rp[p] });
                    if (q === 1) return get(ins.add_rp_rp, { dst: rp[2], src: rp[p] });
                    return get(ins.nop);
                case 2:
                    if (q === 0) {
                        if (p === 0) return get(ins.ld_mem_rp_a, { rp: 'bc' });
                        if (p === 1) return get(ins.ld_mem_rp_a, { rp: 'de' });
                        if (p === 2) return get(ins.ld_mem_nn_rp, { rp: rp[p] });
                        if (p === 3) return get(ins.ld_mem_nn_a);
                    }
                    if (q === 1) {
                        if (p === 0) return get(ins.ld_a_mem_rp, { rp: 'bc' });
                        if (p === 1) return get(ins.ld_a_mem_rp, { rp: 'de' });
                        if (p === 2) return get(ins.ld_rp_mem_nn, { rp: rp[p] });
                        if (p === 3) return get(ins.ld_a_mem_nn);
                    }
                    return get(ins.nop);
                case 3:
                    if (q === 0) return get(ins.inc_rp, { rp: rp[p] });
                    if (q === 1) return get(ins.dec_rp, { rp: rp[p] });
                    return get(ins.nop);
                case 4: return get(ins.inc_r, { rs: rs[y] });
                case 5: return get(ins.dec_r, { rs: rs[y] });
                case 6: return get(ins.ld_r_n, { rs: rs[y] });
                case 7:
                    switch (y) {
                        case 0: return get(ins.rot_a, { rot: alu.rlc });
                        case 1: return get(ins.rot_a, { rot: alu.rrc });
                        case 2: return get(ins.rot_a, { rot: alu.rl });
                        case 3: return get(ins.rot_a, { rot: alu.rr });
                        case 4: return get(ins.daa);
                        case 5: return get(ins.cpl);
                        case 6: return get(ins.scf);
                        case 7: return get(ins.ccf);
                    }
                default: return get(ins.nop);
            }
        case 1:
            if (z === 6 && y === 6) return get(ins.halt);
            return get(ins.ld_r_r, { dst: rs[y], src: rs[z] });
        case 2: return get(ins.alu_r, { acc: acc[y], rs: rs[z] });
        case 3:
            switch (z) {
                case 0: return get(ins.ret_cc, { cc: cc[y] })
                case 1:
                    if (q === 0) return get(ins.pop_rp, { rp: rp2[p] });
                    if (q === 1) {
                        if (p === 0) return get(ins.ret);
                        if (p === 1) return get(ins.exx);
                        if (p === 2) return get(ins.jp_rp, { rp: rp[2] });
                        if (p === 3) return get(ins.ld_sp_rp, { rp: rp[2] });
                    }
                    return get(ins.nop);
                case 2: return get(ins.jp_cc_nn, { cc: cc[y] });
                case 3: {
                    switch (y) {
                        case 0: return get(ins.jp_nn);
                        case 1:
                            // CB
                            break;
                        case 2: return get(ins.out_n_a);
                        case 3: return get(ins.in_a_n);
                        case 4: return get(ins.ex_mem_sp_rp, { rp: rp[2] });
                        case 5: return get(ins.ex_de_hl);
                        case 6: return get(ins.di);
                        case 7: return get(ins.ei);
                        default: return get(ins.nop);
                    }
                }
                case 4: return get(ins.call_cc_nn, { cc: cc[y] });
                case 5:
                    if (q === 0) return get(ins.push_rp, { rp: rp2[p] });
                    if (q === 1) {
                        if (p === 0) return get(ins.call_nn);
                    }
                    return get(ins.nop);
                case 6: return get(ins.alu_n, { acc: acc[y] });
                case 7: return get(ins.rst, { address: y * 8 });
                default: return get(ins.nop);
            }
        default:
            break;
    }
    return get(ins.nop);
}

export const decodeCb = (op: number): Decoded => {
    const [x, y, z,] = opPatterns(op);
    if (x === 0) return get(ins.rot_r, { rot: rot[y], rs: rs[z] });
    if (x === 1) return get(ins.bit_y_r, { y: y, rs: rs[z] });
    if (x === 2) return get(ins.res_y_r, { y: y, rs: rs[z] });
    if (x === 3) return get(ins.set_y_r, { y: y, rs: rs[z] });
    return get(ins.nop);
}

export const decodeEd = (op: number): Decoded => {
    const [x, y, z, p, q] = opPatterns(op);
    if (x === 0 || x === 3) return get(ins.noni);
    if (x === 1) {
        switch (z) {
            case 0:
                if (y === 6) return get(ins.in_c);
                return get(ins.in_r_c, { rs: rs[y] });
            case 1:
                if (y === 6) return get(ins.out_c_0);
                return get(ins.out_c_r, { rs: rs[y] });
            case 2:
                if (q === 0) return get(ins.sbc_hl_rp, { rp: rp[p] });
                if (q === 1) return get(ins.adc_hl_rp, { rp: rp[p] });
                break;
            case 3:
                if (q === 0) return get(ins.ld_mem_nn_rp, { rp: rp[p] });
                if (q === 1) return get(ins.ld_rp_mem_nn, { rp: rp[p] });
                break;
            case 4: return get(ins.neg);
            case 5:
                if (y === 1) return get(ins.reti);
                return get(ins.retn);
            case 6: return get(ins.im, { im: im[y] });
            case 7:
                if (y === 0) return get(ins.ld_i_a);
                if (y === 2) return get(ins.ld_a_i);
                if (y === 4) return get(ins.rrd);
                if (y === 5) return get(ins.rld);
                break;
            default:
                return get(ins.nop);
        }
    }
    if (x === 2) {
        if (z <= 3 && y >= 4) {
            if (y >= 6) {
                if (z >= 2) return get(ins.block_io, { bli: bli[y][z] });
                return get(ins.block_load, { bli: bli[y][z] });
            }
            return get(ins.block_single, { bli: bli[y][z] });
        }
        return get(ins.noni);
    }
    return get(ins.nop);
}


export const decodeIdx = (op: number, idx: 'ix' | 'iy'): Decoded => {
    if (op === 0x34) return get(ins.inc_idx, { idx: idx });
    if (op === 0x35) return get(ins.dec_idx, { idx: idx });
    if (op === 0x36) return get(ins.ld_idx_n, { idx: idx });

    rp[2] = idx;
    rp2[2] = idx;
    rs[4] = `${idx}h`;
    rs[5] = `${idx}l`;
    rs[6] = `(${idx} + D)`;
    const [x, y, z,] = opPatterns(op);
    if (x === 1 && (y === 6 || z === 6)) {
        rs[4] = rs[4][2] as RegisterSingle;
        rs[5] = rs[5][2] as RegisterSingle;
    }

    const decoded = decodeBase(op);

    rp[2] = 'hl';
    rp2[2] = 'hl';
    rs[4] = 'h';
    rs[5] = 'l';
    rs[6] = '(hl)';

    return decoded;
}

export const decodeIdxcb = (op: number, idx: 'ix' | 'iy') => {
    const [x, y, z,] = opPatterns(op);
    switch (x) {
        case 0:
            if (z !== 6) return get(ins.ld_r_rot_idx, { rot: rot[y], rs: rs[z], idx: idx });
            else return get(ins.rot_idx, { rot: rot[y], idx: idx });
        case 1: return get(ins.bit_y_idx, { y: y, idx: idx });
        case 2:
            if (z !== 6) return get(ins.ld_res_y_idx, { y: y, rs: rs[z], idx: idx })
            else return get(ins.res_y_idx, { y: y, idx: idx });
        case 3:
            if (z !== 6) return get(ins.ld_set_y_idx, { y: y, rs: rs[z], idx: idx })
            else return get(ins.set_y_idx, { y: y, idx: idx });
        default:
            return get(ins.nop);
    }
}

export const opPatterns = (op: number): number[] => {
    const x = (op & 0xc0) >>> 6;
    const y = (op & 0x38) >>> 3;
    const z = op & 0x07;
    const p = y >>> 1;
    const q = y % 2;
    return [x, y, z, p, q];
}
