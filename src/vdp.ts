export class Vdp {

    vram = new Array<number>(2 ** 14);
    cram = new Array<number>(32);
    registers = new Array<number>(11);

    addressRegister = 0;
    // 1 for VRAM, 2 for CRAM
    codeRegister = 0;
    readBuffer = 0;
    vCounter = 0;
    hCounter = 0;

    firstControlByte = true;
    spriteOverflow = false;
    spriteCollision = false;
    frameInterruptPending = false;
    lineInterruptPending = false;
    requestedInterrupt = false;

    readControlPort() {
        const status = 
            +this.frameInterruptPending << 7 |
            +this.spriteOverflow << 6 |
            +this.spriteCollision << 5;
        this.firstControlByte = true;
        this.frameInterruptPending = false;
        this.spriteCollision = false;
        this.spriteOverflow = false;
        return status;
    }

    writeControlPort(value: number) {
        value &= 0xff;
        if (this.firstControlByte) {
            this.firstControlByte = false;
            this.addressRegister = value;
        }
        else {
            this.firstControlByte = true;
            this.addressRegister |= (value & 0x3f) << 8;
            const op = value >> 6;
            if (op === 0) {
                this.readBuffer = this.vram[this.addressRegister];
                this.incrementAddress();
            }
            else if (op === 2) {
                const idx = value & 0xf;                    
                if (idx < 11) this.registers[idx] = this.addressRegister;
            }
            this.codeRegister = op;
        }
    }

    readDataPort(): number{
        this.firstControlByte = true;
        if (this.codeRegister === 3) {
            // CRAM read
            this.readBuffer = this.cram[this.addressRegister & 0x1f];
        }
        else {
            this.readBuffer = this.vram[this.addressRegister];
        }
        this.incrementAddress();
        return this.readBuffer;
    }

    writeDataPort(value: number) {
        value &= 0xff;
        this.firstControlByte = true;
        if (this.codeRegister === 3) {
            // CRAM write
            this.cram[this.addressRegister & 0x1f] = value;
        }
        else {
            this.vram[this.addressRegister] = value;
        }
        this.incrementAddress();
    }

    incrementAddress() {
        this.addressRegister++;
        if (this.addressRegister > 0x3fff) {
            this.addressRegister = 0;
        }
    }
}

