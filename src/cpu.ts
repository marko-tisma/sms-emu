import * as alu from "./alu";
import { Bus } from "./bus";
import { decode, Instruction, InterruptMode } from "./decoder";
import { Register } from "./register";
import { generateInstructionTable } from "./table_generator";
import { toSigned } from "./util";

export enum RegisterName {
    B, C, D, E, H, L, F, A
}

enum DecodingMode {
    TABLE, DECODE
}

// Zilog Z80 CPU
// Reference: http://www.zilog.com/docs/z80/um0080.pdf 
export class Cpu {

    // 8 bit general registers
    registers: Register[];

    // Shadow registers are swapped with general registers after the EXX instruction is executed
    shadowRegisters: Register[];

    // Index registers
    private _ix = new Register(2);
    private _iy = new Register(2);
    private _i = new Register(1);
    private _r = new Register(1);

    private _sp = new Register(2);
    private _pc = new Register(2);

    flags: { [key: string]: boolean } = {
        s: false,
        z: false,
        y: false,
        h: false,
        x: false,
        pv: false,
        n: false,
        c: false,
    }

    shadowFlags: { [key: string]: boolean } = {
        s: false,
        z: false,
        y: false,
        h: false,
        x: false,
        pv: false,
        n: false,
        c: false,
    }

    // Number of CPU cycles for the current executing instruction
    tstates = 0;
    halted = false;
    interruptMode: InterruptMode = 1;

    // Last instruction was enable interrupts
    eiRequested = false;

    pausePressed = false;
    resetRequested = false;
    handlingReset = false;

    // Enable maskable interrupts flag
    iff1 = false;

    // Temp storage for iff1 during non-maskable interrupt
    iff2 = false;

    // Table mode trades off using more memory for better execution time
    decodingMode = DecodingMode.TABLE;
    instructionTable: Function[] = [];

    // Instruction functions in table mode are scoped to cpu object so they need these
    alu = alu;
    RegisterName = RegisterName;

    constructor(public bus: Bus) {
        this.registers = Array.from({ length: 8 }, () => new Register(1));
        this.shadowRegisters = Array.from({ length: 8 }, () => new Register(1));
        this.sp = 0xdff0;
        this.bus.out(0xdc, 0xff);
        this.bus.out(0xdd, 0xff);
        if (this.decodingMode === DecodingMode.TABLE) {
            this.instructionTable = generateInstructionTable(this);
        }
    }

    step(): number {
        this.tstates = 0;

        if (this.handleInterrupts()) return 13;
        if (this.halted) return 4;

        let op = this.next8();
        let instruction: Instruction;
        if (this.decodingMode === DecodingMode.DECODE) {
            let decoded = decode(op, this);
            instruction = decoded.instructionConstructor(this, decoded.params);
            instruction.execute();
        }
        else {
            this.instructionTable[op]();
        }
        this.incrementRefreshRegister();
        return this.tstates;
    }

    handleInterrupts(): boolean {
        let interrupt = false;
        if (this.pausePressed && this.bus.vdp.getVCounter() === 0xff) {
            this.pausePressed = false;
            this.handlingReset = true;
            this.iff2 = this.iff1;
            this.iff1 = false;
            this.halted = false;
            this.push16(this.pc);
            this.pc = 0x66;
            interrupt = true;
        }
        else if (this.iff1 && this.bus.vdp.requestedInterrupt) {
            this.bus.vdp.requestedInterrupt = false;
            this.iff1 = this.iff2 = false;
            this.halted = false;
            this.push16(this.pc);
            this.pc = this.interruptMode === 1 ? 0x38 : this.i << 8;
            interrupt = true;
        }

        if (this.eiRequested) {
            this.iff1 = true;
            this.iff2 = true;
            this.eiRequested = false;
        }

        return interrupt;
    }

    push8(value: number) {
        this.sp--;
        this.bus.write8(this.sp, value);
    }

    pop8(): number {
        return this.bus.read8(this.sp++);
    }

    push16(value: number) {
        this.push8(value >>> 8);
        this.push8(value & 0xff);
    }

    pop16(): number {
        return this.pop8() + (this.pop8() << 8);
    }

    next8(): number {
        return this.bus.read8(this.pc++);
    }

    next8Signed(): number {
        return toSigned(this.next8());
    }

    next16(): number {
        const value = this.bus.read16(this.pc);
        this.pc += 2;
        return value;
    }

    incrementRefreshRegister(): void {
        this.r = (this.r & 0x80) | ((this.r + 1) & 0x7f);
    }

    get r(): number { return this._r.value; }

    set r(value: number) { this._r.value = value; }

    get i(): number { return this._i.value; }

    set i(value: number) { this._i.value = value; }

    get ['(ix + D)'](): number { return this.bus.read8(this.ix + this.next8Signed()) }

    set ['(ix + D)'](value: number) { this.bus.write8(this.ix + this.next8Signed(), value) }

    get ['(iy + D)'](): number { return this.bus.read8(this.iy + this.next8Signed()) }

    set ['(iy + D)'](value: number) { this.bus.write8(this.iy + this.next8Signed(), value) }

    get ['(ix)'](): number { return this.bus.read8(this.ix) }

    set ['(ix)'](value: number) { this.bus.write8(this.ix, value) }

    get ['(iy)'](): number { return this.bus.read8(this.iy) }

    set ['(iy)'](value: number) { this.bus.write8(this.iy, value) }

    get ix(): number { return this._ix.value; }

    set ix(value: number) { this._ix.value = value; }

    get iy(): number { return this._iy.value; }

    set iy(value: number) { this._iy.value = value; }

    get ixh(): number { return this._ix.value >>> 8; }

    set ixh(value: number) { this._ix.value = this.ixl + (value << 8); }

    get ixl(): number { return this._ix.value & 0xff; }

    set ixl(value: number) { this._ix.value = (this.ixh << 8) + (value & 0xff); }

    get iyh(): number { return this._iy.value >>> 8; }

    set iyh(value: number) { this._iy.value = this.iyl + (value << 8); }

    get iyl(): number { return this._iy.value & 0xff; }

    set iyl(value: number) { this._iy.value = (this.iyh << 8) + (value & 0xff); }

    get ['(hl)'](): number { return this.bus.read8(this.hl); }

    set ['(hl)'](value: number) { this.bus.write8(this.hl, value); }

    get af(): number { return (this.registers[RegisterName.A].value << 8) + this.f; }

    set af(value: number) {
        this.f = value & 0xff;
        this.registers[RegisterName.A].value = value >>> 8;
    }

    get bc(): number { return (this.registers[RegisterName.B].value << 8) + this.registers[RegisterName.C].value; }

    set bc(value: number) {
        this.registers[RegisterName.C].value = value & 0xff;
        this.registers[RegisterName.B].value = value >>> 8;
    }

    get de(): number { return (this.registers[RegisterName.D].value << 8) + this.registers[RegisterName.E].value; }

    set de(value: number) {
        this.registers[RegisterName.E].value = value & 0xff;
        this.registers[RegisterName.D].value = value >>> 8;
    }

    get hl(): number { return (this.registers[RegisterName.H].value << 8) + this.registers[RegisterName.L].value; }

    set hl(value: number) {
        this.registers[RegisterName.L].value = value & 0xff;
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

    get f(): number {
        let f = 0;
        let shift = 7;
        for (const flag of Object.values(this.flags)) {
            f |= (+flag) << shift;
            shift--;
        }
        return f;
    }

    set f(value: number) {
        let mask = 1 << 7;
        for (const flag of Object.keys(this.flags)) {
            this.flags[flag] = !!(value & mask);
            mask >>>= 1;
        }
        this.registers[RegisterName.F].value = value;
    }

    get pc(): number { return this._pc.value; }

    set pc(value: number) { this._pc.value = value; }

    get sp(): number { return this._sp.value; }

    set sp(value: number) { this._sp.value = value; }
}


