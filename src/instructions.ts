import * as Alu from "./alu" 
import { Cpu, Flag, RegisterName } from "./cpu";
import { R, RP } from "./decoder";


export class Instruction {
    disassembly?: string;
    params?: any;
    constructor(
        public tstates: number,
        public execute: (cpu: Cpu, ...params: any) => void, 
        public mnemonic: string
    ) {}
}

export const get = (instruction: Instruction, ...params: any): Instruction => {
    instruction.params = params;
    return instruction;
}

export const toSignedByte = (byte: number): number => {
    return new Int8Array([byte])[0];
}

export const nop = new Instruction(4, (cpu: Cpu) => {}, 'nop');

export const noni = new Instruction(4, (cpu: Cpu) => {
    cpu.iff1 = false;
    cpu.iff2 = false;
    cpu.eiRequested = true;
}, 'noni');

export const ex_af_af1 = new Instruction(4, (cpu: Cpu) => {
    const tmpA = cpu.registers[RegisterName.A];
    const tmpF = cpu.registers[RegisterName.F];
    cpu.registers[RegisterName.A] = cpu.shadowRegisters[RegisterName.A];
    cpu.registers[RegisterName.F] = cpu.shadowRegisters[RegisterName.F];
    cpu.shadowRegisters[RegisterName.A] = tmpA;
    cpu.shadowRegisters[RegisterName.F] = tmpF;
}, 'ex af af`');

export const djnz_d = new Instruction(8, (cpu: Cpu) => {
    cpu.b--;
    const d = toSignedByte(cpu.next8());
    if (cpu.b != 0) {
        cpu.pc += d; 
        djnz_d.tstates = 13;
    }
}, 'djnz D');

export const jr_d = new Instruction(12, (cpu: Cpu) => {
    const d = toSignedByte(cpu.next8());
    cpu.pc += d; 
}, 'jr D');

export const jr_cc = new Instruction(7, (cpu: Cpu, cc: (cpu: Cpu) => boolean) => {
    const d = toSignedByte(cpu.next8());
    if (cc(cpu)) {
        cpu.pc += d; 
        jr_cc.tstates = 12;
    }
}, 'jr CC, D');

export const ld_rp_nn = new Instruction(10, (cpu: Cpu, rp: RP) => {
    cpu[rp] = cpu.next16();
}, 'ld rp0, NN');

export const add_rp_rp = new Instruction(11, (cpu: Cpu, dst: RP, src: RP) => {
    cpu[dst] = Alu.add16(cpu, cpu[dst], cpu[src]);
}, 'add rp0, rp1');

export const ld_mem_a = new Instruction(7, (cpu: Cpu, dst: RP) => {
    cpu.memory.write8(cpu[dst], cpu.a);
}, 'ld (rp0), a');

export const ld_nn_r = new Instruction(13, (cpu: Cpu, src: RP | R) => {
    if (src.length == 1) {
        cpu.memory.write8(cpu.next16(), cpu[src]);
    }
    else {
        cpu.memory.write16(cpu.next16(), cpu[src]);
        ld_nn_r.tstates = 16;
    }
}, 'ld (NN), r0');

export const ld_a_mem = new Instruction(7, (cpu: Cpu, src: RP) => {
    cpu.a = cpu.memory.read8(cpu[src]); 
}, 'ld a, (rp0)');

export const ld_hl_mem_nn = new Instruction(16, (cpu: Cpu) => {
    cpu.hl = cpu.memory.read16(cpu.next16());
}, 'ld hl, (NN)');

export const ld_a_mem_nn = new Instruction(13, (cpu: Cpu) => {
    cpu.a = cpu.memory.read8(cpu.next16());
}, 'ld a, (NN)');

export const inc_rp = new Instruction(6, (cpu: Cpu, rp: RP) => {
    cpu[rp]++;
}, 'inc rp0');

export const dec_rp = new Instruction(6, (cpu: Cpu, rp: RP) => {
    cpu[rp]--;
}, 'dec rp0');

export const inc_r = new Instruction(4, (cpu: Cpu, r: R) => {
    cpu[r] = Alu.inc8(cpu, cpu[r]);
}, 'inc r0');

export const dec_r = new Instruction(4, (cpu: Cpu, r: R) => {
    cpu[r] = Alu.dec8(cpu, cpu[r]);
}, 'dec r0');

export const ld_r_n = new Instruction(7, (cpu: Cpu, r: R) => {
    cpu[r] = cpu.next8();
}, 'ld r0, N');

export const rlca = new Instruction(4, (cpu: Cpu) => {
    cpu.a = Alu.rlc(cpu, cpu.a);
}, 'rlca');

export const rrca = new Instruction(4, (cpu: Cpu) => {
    cpu.a = Alu.rrc(cpu, cpu.a);
}, 'rrca');

export const rla = new Instruction(4, (cpu: Cpu) => {
    cpu.a = Alu.rl(cpu, cpu.a);
}, 'rla');

export const rra = new Instruction(4, (cpu: Cpu) => {
    cpu.a = Alu.rr(cpu, cpu.a);
}, 'rra');

export const daa = new Instruction(4, (cpu: Cpu) => {
    Alu.daa(cpu);
}, 'daa');

export const cpl = new Instruction(4, (cpu: Cpu) => {
    cpu.a = ~cpu.a;
    cpu.setFlag(Flag.HALF_CARRY, true);
    cpu.setFlag(Flag.SUB, true);
}, 'cpl');

export const scf = new Instruction(4, (cpu: Cpu) => {
    cpu.setFlag(Flag.CARRY, true);
    cpu.setFlag(Flag.HALF_CARRY, false);
    cpu.setFlag(Flag.SUB, false);
}, 'scf');

export const ccf = new Instruction(4, (cpu: Cpu) => {
    cpu.setFlag(Flag.CARRY, !cpu.getFlag(Flag.CARRY));
    cpu.setFlag(Flag.HALF_CARRY, cpu.getFlag(Flag.CARRY));
    cpu.setFlag(Flag.SUB, false);
}, 'ccf');

export const halt = new Instruction(4, (cpu: Cpu) => {
    cpu.halted = true;
}, 'halt');

export const ld_r_r = new Instruction(4, (cpu: Cpu, dst: R, src: R) => {
    cpu[dst] = cpu[src];
}, 'ld r0, r1');

export const alu_r = new Instruction(4, (cpu: Cpu, Alu: (cpu: Cpu, vAlue: number) => void, r: R) => {
    Alu(cpu, cpu[r]);
}, 'ALU r1');

export const ret_cc = new Instruction(5, (cpu: Cpu, cc: (cpu: Cpu) => boolean) => {
    if (cc(cpu)) {
        cpu.pc = cpu.pop16();
        ret_cc.tstates = 11;
    }
}, 'ret CC');

export const pop_rp = new Instruction(10, (cpu: Cpu, rp: RP) => {
    cpu[rp] = cpu.pop16();
}, 'pop rp0');

export const ret = new Instruction(10, (cpu: Cpu) => {
    cpu.pc = cpu.pop16();
}, 'ret');

export const exx = new Instruction(4, (cpu: Cpu) => {
    const tmp = cpu.registers;
    cpu.registers = cpu.shadowRegisters;
    cpu.shadowRegisters = tmp;
}, 'exx');

export const jp_rp = new Instruction(4, (cpu: Cpu, rp: RP) => {
    cpu.pc = cpu[rp];
}, 'jp rp0');

export const ld_sp_rp = new Instruction(6, (cpu: Cpu, rp: RP) => {
    cpu.sp = cpu[rp];
}, 'ld sp, rp0');

export const jp_cc_nn = new Instruction(10, (cpu: Cpu, cc: (cpu: Cpu) => boolean) => {
    const nn = cpu.next16();
    if (cc(cpu)) {
        cpu.pc = nn;
    }
}, 'jp CC, NN');

export const jp_nn = new Instruction(10, (cpu: Cpu) => {
    cpu.pc = cpu.next16();
}, 'jp NN');

export const rot_r = new Instruction(8, (cpu: Cpu, rot: (cpu: Cpu, r: number) => number, r: R) => {
    if (r == '_hl_') rot_r.tstates = 15;
    cpu[r] = rot(cpu, cpu[r]);
}, 'ROT r1');

export const bit_y_r = new Instruction(8, (cpu: Cpu, y: number, r: R) => {
    const mask = 1 << y;
    cpu.setFlag(Flag.ZERO, !(mask & cpu[r]));
    cpu.setFlag(Flag.HALF_CARRY, true);
    cpu.setFlag(Flag.SUB, false);
}, 'bit Y r1');

export const res_y_r = new Instruction(8, (cpu: Cpu, y: number, r: R) => {
    const mask = 1 << y;
    cpu[r] &= (~mask);
}, 'res Y r1');

export const set_y_r = new Instruction(8, (cpu: Cpu, y: number, r: R) => {
    cpu[r] |= 1 << y;
}, 'set Y r1');

export const out_n_a = new Instruction(11, (cpu: Cpu) => {
    cpu.memory.out(cpu.next8(), cpu.a);
}, 'out (N), a');

export const in_a_n = new Instruction(11, (cpu: Cpu) => {
    cpu.a = cpu.memory.in(cpu.next8());
}, 'in a, (N)');

export const ex_mem_sp_rp = new Instruction(19, (cpu: Cpu, rp: RP) => {
    let tmp = cpu.memory.read16(cpu.sp);
    cpu.memory.write16(cpu.sp, cpu[rp]);
    cpu[rp] = tmp;
}, 'ex (sp), rp0');

export const ex_de_hl = new Instruction(4, (cpu: Cpu) => {
    const tmpDe = cpu.de;
    cpu.de = cpu.hl;
    cpu.hl = tmpDe;
}, 'ex de, hl');

export const di = new Instruction(4, (cpu: Cpu) => {
    cpu.iff1 = false;
    cpu.iff2 = false;
}, 'di');

export const ei = new Instruction(4, (cpu: Cpu) => {
    cpu.eiRequested = true;
}, 'ei');

export const push_rp = new Instruction(11, (cpu: Cpu, rp: RP) => {
    cpu.push16(cpu[rp]);
}, 'push rp0');

export const call_nn = new Instruction(17, (cpu: Cpu) => {
    const nn = cpu.next16();
    cpu.push16(cpu.pc);
    cpu.pc = nn;
}, 'call NN');

export const call_cc_nn = new Instruction(17, (cpu: Cpu, cc: (cpu: Cpu) => boolean) => {
    const nn = cpu.next16();
    if (cc(cpu)) {
        cpu.push16(cpu.pc);
        cpu.pc = nn; 
    }
}, 'call CC, NN');

export const alu_n = new Instruction(7, (cpu: Cpu, Alu: (cpu: Cpu, v: number) => void) => {
    Alu(cpu, cpu.next8());
}, 'ALU N');

export const rst = new Instruction(11, (cpu: Cpu, addr: number) => {
    cpu.push16(cpu.pc);
    cpu.pc = addr;
}, 'RST Y');

export const in_c = new Instruction(12, (cpu: Cpu) => {
    Alu.in_p(cpu, cpu.c);
}, 'in (c)');

export const in_r_c = new Instruction(12, (cpu: Cpu, r: R) => {
    cpu[r] = Alu.in_p(cpu, cpu.c);
}, 'in r0, (c)');

export const out_c_0 = new Instruction(12, (cpu: Cpu) => {
    cpu.memory.out(cpu.c, 0);
}, 'out (c), 0');

export const out_c_r = new Instruction(12, (cpu: Cpu, r: R) => {
    cpu.memory.out(cpu.c, cpu[r]);
}, 'out (c), r0');

export const sbc_hl_rp = new Instruction(15, (cpu: Cpu, rp: RP) => {
    cpu.hl = Alu.sbc16(cpu, cpu.hl, cpu[rp]);
}, 'sbc hl, rp0');

export const adc_hl_rp = new Instruction(15, (cpu: Cpu, rp: RP) => {
    cpu.hl = Alu.adc16(cpu, cpu.hl, cpu[rp]);
}, 'adc hl, rp0');

export const ld_nn_rp = new Instruction(20, (cpu: Cpu, rp: RP) => {
    cpu.memory.write16(cpu.next16(), cpu[rp]);
}, 'ld (NN), rp0');

export const ld_rp_mem_nn = new Instruction(20, (cpu: Cpu, rp: RP) => {
    cpu[rp] = cpu.memory.read16(cpu.next16());
}, 'ld rp0, (NN)');

export const neg = new Instruction(8, (cpu: Cpu) => {
    cpu.a = ~cpu.a;
}, 'neg');

export const reti = new Instruction(14, (cpu: Cpu) => {
    cpu.pc = cpu.pop16();
}, 'reti');

export const retn = new Instruction(14, (cpu: Cpu) => {
    cpu.pc = cpu.pop16();
    cpu.iff1 = cpu.iff2;
}, 'retn');

export const rot_idx = new Instruction(23, (cpu: Cpu, rot: (cpu: Cpu, vAlue: number) => number, address: number) => {
    cpu.memory.write8(address, rot(cpu, cpu.memory.read8(address)));
}, 'ROT (IDX)');

export const ld_r_rot_idx = new Instruction(23, (cpu: Cpu, rot: (cpu: Cpu, vAlue: number) => number, address: number, r: R) => {
    cpu.memory.write8(address, rot(cpu, cpu.memory.read8(address)));
    cpu[r] = cpu.memory.read8(address);
}, 'ROT (IDX), r2');

export const bit_y_idx = new Instruction(20, (cpu: Cpu, y: number, address: number) => {
    const mask = 1 << y;
    cpu.setFlag(Flag.ZERO, !(mask & cpu.memory.read8(address)));
    cpu.setFlag(Flag.HALF_CARRY, true);
    cpu.setFlag(Flag.SUB, false);
}, 'bit Y, (IDX)');

export const res_y_idx = new Instruction(23, (cpu: Cpu, y: number, address: number) => {
    const m = 1 << y;
    const result = (~m) & cpu.memory.read8(address);
    cpu.memory.write8(address, result);
}, 'res Y, (IDX)');

export const ld_res_y_idx = new Instruction(23, (cpu: Cpu, y: number, address: number, r: R) => {
    res_y_idx.execute(cpu, address, y);
    cpu[r] = cpu.memory.read8(address);
}, 'res Y, (IDX), r2');

export const set_y_idx = new Instruction(23, (cpu: Cpu, y: number, address: number) => {
    const m = 1 << y;
    const result = m | cpu.memory.read8(address);
    cpu.memory.write8(address, result);
}, 'set Y, (IDX)');

export const ld_set_y_idx = new Instruction(23, (cpu: Cpu, y: number, address: number, r: R) => {
    set_y_idx.execute(cpu, address, y);
    cpu[r] = cpu.memory.read8(address);
}, 'set Y, (IDX), r2');

export const bl_i = new Instruction(16, (cpu: Cpu, f: (cpu: Cpu) => boolean) => {
    if (f(cpu)) bl_i.tstates = 21;
}, 'BLI');
