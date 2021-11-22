import { decode } from "./decoder";
import { disassemble } from "./disassembler";
import { Memory } from "./memory";
import { Register } from "./register";

export const enum RegisterName {
    B, C, D, E, H, L, F, A
}

export const enum Flag {
    SIGN = 1 << 7,
    ZERO = 1 << 6,
    Y = 1 << 5,
    HALF_CARRY = 1 << 4,
    X = 1 << 3,
    PARITY_OVERFLOW = 1 << 2,
    SUB = 1 << 1,
    CARRY = 1
}

export class Cpu {
    
    // General registers
    registers: Register[];

    // Shadow registers are swapped with general registers after the EXX instruction is executed
    shadowRegisters: Register[];

    private _sp = new Register(2);
    private _pc = new Register(2);

    // Index registers
    private _ix = new Register(2);
    private _iy = new Register(2);

    // Flags

    halted = false;
    // Last instruction was EI
    eiRequested = false;
    // Pause was pressed
    resetRequested = false;
    handlingReset = false;
    // Enable maskable interrupts flag
    iff1 = false;
    // Temp storage for iff1 during nonmaskable interrupt
    iff2 = false;

    constructor(public memory: Memory) {
        this.registers = Array.from({length: 8}, () => new Register(1));
        this.shadowRegisters = Array.from({length: 8}, () => new Register(1));
        this.sp = 0xdff0;
    }

    // Returns the number of TSTATES this instruction took
    run(op: number): number {
        if (this.halted) return 1;
        this.handleInterrupts();
        if (this.eiRequested) {
            this.iff1 = true;
            this.iff2 = true;
        }
        const instruction = decode(op, this);
        console.log(disassemble(instruction, this));
        instruction.execute(this, ...instruction.params);
        return instruction.tstates;
    }

    handleInterrupts(): void {
        if (this.resetRequested) {
            this.resetRequested = false;
            this.handlingReset = true;
            this.iff2 = this.iff1;
            this.iff1 = false;
            this.halted = false;
            this.push16(this.pc);
            this.pc = 0x66;
        }
    }

    push8(value: number) {
        this.sp--;
        this.memory.write8(this.sp, value);
    }

    pop8(): number {
        const value = this.memory.read8(this.sp);
        this.sp++;
        return value;
    }

    push16(value: number) {
        this.push8(value >>> 8);
        this.push8(value & 0xff);
    }

    pop16(): number {
        return this.pop8() + (this.pop8() << 8);
    }

    next8() {
        const value = this.memory.read8(this.pc++);
        return value;
    }

    next16() {
        const word = this.memory.read16(this.pc);
        this.pc += 2;
        return word;
    }

    getFlag(flag: Flag): boolean{
        return !!(this.f & flag);
    }

    setFlag(flag: Flag, value: boolean) {
        !value ? this.f &= ~(flag) : this.f |= flag;
    }

    get flag_z(): boolean { return this.getFlag(Flag.ZERO); }

    set flag_z(value: boolean) { this.setFlag(Flag.ZERO, value); }

    get flag_s(): boolean { return this.getFlag(Flag.SIGN); }

    set flag_s(value: boolean) { this.setFlag(Flag.SIGN, value); }

    get flag_h(): boolean { return this.getFlag(Flag.HALF_CARRY); }

    set flag_h(value: boolean) { this.setFlag(Flag.HALF_CARRY, value); }

    get flag_pv(): boolean { return this.getFlag(Flag.PARITY_OVERFLOW); }

    set flag_pv(value: boolean) { this.setFlag(Flag.PARITY_OVERFLOW, value); }

    get flag_n(): boolean { return this.getFlag(Flag.SUB); }

    set flag_n(value: boolean) { this.setFlag(Flag.SUB, value); }

    get flag_c(): boolean { return this.getFlag(Flag.CARRY); }

    set flag_c(value: boolean) { this.setFlag(Flag.CARRY, value); }

    get ix(): number { return this._ix.value; }

    set ix(value: number) { this._ix.value = value; }

    get iy(): number { return this._iy.value; }

    set iy(value: number) { this._iy.value = value; }

    get ixh(): number { return this._ix.value >>> 8; }

    set ixh(value: number) {this._ix.value = this.ixl + (value << 8); }

    get ixl(): number { return this._ix.value & 0xff; }
    
    set ixl(value: number) { this._ix.value = (this.ixh << 8) + (value & 0xff); }

    get iyh(): number { return this._iy.value >>> 8; }

    set iyh(value: number) {this._iy.value = this.iyl + (value << 8); }

    get iyl(): number { return this._iy.value & 0xff; }
    
    set iyl(value: number) { this._iy.value = (this.iyh << 8) + (value & 0xff); }

    get _hl_(): number { return this.memory.read8(this.hl); }  

    set _hl_(value: number) { this.memory.write8(this.hl, value); } 

    get af(): number { return (this.registers[RegisterName.A].value << 8) + this.registers[RegisterName.F].value; }

    set af(value: number) {
        this.registers[RegisterName.F].value = value & 0xFF;
        this.registers[RegisterName.A].value = value >>> 8;
    }

    get bc(): number { return (this.registers[RegisterName.B].value << 8) + this.registers[RegisterName.C].value; }

    set bc(value: number) {
        this.registers[RegisterName.C].value = value & 0xFF;
        this.registers[RegisterName.B].value = value >>> 8;
    }

    get de(): number { return (this.registers[RegisterName.D].value << 8) + this.registers[RegisterName.E].value; }

    set de(value: number) {
        this.registers[RegisterName.E].value = value & 0xFF;
        this.registers[RegisterName.D].value = value >>> 8;
    }

    get hl(): number { return (this.registers[RegisterName.H].value << 8) + this.registers[RegisterName.L].value; }

    set hl(value: number) {
        this.registers[RegisterName.L].value = value & 0xFF;
        this.registers[RegisterName.H].value = value >>> 8;
    }

    get a(): number { return this.registers[RegisterName.A].value; }

    set a(value: number) { this.registers[RegisterName.A].value = value; }

    get b(): number { return this.registers[RegisterName.B].value; }

    set b(value: number) { this.registers[RegisterName.B].value = value; }

    get c(): number { return this.registers[RegisterName.C].value; }

    set c(value: number) { this.registers[RegisterName.C].value = value; }

    get d(): number { return this.registers[RegisterName.D].value; }

    set d(value: number) { this.registers[RegisterName.D].value = value; }

    get e(): number { return this.registers[RegisterName.E].value; }

    set e(value: number) { this.registers[RegisterName.E].value = value; }
    
    get h(): number { return this.registers[RegisterName.H].value; }

    set h(value: number) { this.registers[RegisterName.H].value = value; }

    get l(): number { return this.registers[RegisterName.L].value; }

    set l(value: number) { this.registers[RegisterName.L].value = value; }

    get f(): number { return this.registers[RegisterName.F].value; }

    set f(value: number) { this.registers[RegisterName.F].value = value; }

    get pc(): number { return this._pc.value; }

    set pc(value: number) { this._pc.value = value; }

    get sp(): number { return this._sp.value; }

    set sp(value: number) { this._sp.value = value; }
}
