import { Register } from "./register";

export enum RegisterName {
    B, C, D, E, H, L, F, A
}

export enum Flag {
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

    constructor() {
        this.registers = Array.from({length: 8}, () => new Register(1));
        this.shadowRegisters = Array.from({length: 8}, () => new Register(1));
        this.sp = 0xdff0;
    }

    setFlag(flag: Flag, value: 0 | 1) {
        value == 0 ? this.f &= ~(flag) : this.f |= flag;
    }

    get bc(): number { return this.registers[RegisterName.B].value << 8 + this.registers[RegisterName.C].value; }

    set bc(value: number) {
        this.registers[RegisterName.C].value = value & 0xFF;
        this.registers[RegisterName.B].value = value >> 8;
    }

    get de(): number { return this.registers[RegisterName.D].value << 8 + this.registers[RegisterName.E].value; }

    set de(value: number) {
        this.registers[RegisterName.E].value = value & 0xFF;
        this.registers[RegisterName.D].value = value >> 8;
    }

    get hl(): number { return this.registers[RegisterName.H].value << 8 + this.registers[RegisterName.L].value; }

    set hl(value: number) {
        this.registers[RegisterName.L].value = value & 0xFF;
        this.registers[RegisterName.H].value = value >> 8;
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