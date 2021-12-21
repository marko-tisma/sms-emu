import { testBit } from "./util";

export class Vdp {

    static TSTATES_PER_SCANLINE = 228;

    vram = new Uint8Array(2 ** 16);
    cram = new Uint8Array(32);
    registers = new Array<number>(11);

    // canvas: HTMLCanvasElement;
    // frameBuffer: ImageData;
    scale = 2;

    // X coordinates for current line
    spritePositions = new Set<number>();

    screenWidth = 256;
    screenHeight = 192;
    scanlines = 262;

    addressRegister = 0;

    // Writes go to CRAM if set to 3, VRAM otherwise 
    codeRegister: 0 | 1 | 2 | 3 = 0;

    // Holds the current scanline
    vCounter = 0;
    hCounter = 0;
    lineCounter = 0;

    vScrollBuffer = 0;
    readBuffer = 0;

    firstControlByte = true;
    spriteOverflow = false;
    spriteCollision = false;
    frameInterruptPending = false;
    lineInterruptPending = false;
    requestedInterrupt = false;
    vCounterJumped = false;

    constructor(private frameBuffer: Uint8ClampedArray) { }

    run(tstates: number) {
        this.hCounter += tstates;
        if (this.hCounter > Vdp.TSTATES_PER_SCANLINE) {
            // New scanline
            this.hCounter -= Vdp.TSTATES_PER_SCANLINE;
            if (this.vCounter <= this.screenHeight) {
                // Active display area
                if (this.vCounter < this.screenHeight) {
                    this.renderSprites();
                    this.renderTiles();
                }
                if (this.vCounter === this.screenHeight) {
                    this.frameInterruptPending = true;
                }
                if (this.lineCounter === 0) {
                    this.lineInterruptPending = true;
                    this.lineCounter = this.registers[10];
                }
                else this.lineCounter--;
            }
            if (this.screenHeight <= this.vCounter) {
                // Vertical refresh
                if (this.screenHeight !== this.vCounter) {
                    this.lineCounter = this.registers[10];
                }
                this.vScrollBuffer = this.registers[9];
            }
            // Update vcounter
            if (this.vCounter === this.scanlines) {
                // Next frame
                this.vCounter = 0;
                this.vCounterJumped = false;
                // this.renderFrame();
            }
            else if (!this.vCounterJumped && this.vCounter === 0xda) {
                this.vCounterJumped = true;
                this.vCounter = 0xd5;
            }
            else this.vCounter++;
        }

        if (this.frameInterruptPending && testBit(5, this.registers[1])) {
            this.requestedInterrupt = true;
        }
        if (this.lineInterruptPending && testBit(4, this.registers[0])) {
            this.requestedInterrupt = true;
        }
    }

    renderSprites() {
        const scanline = this.vCounter;
        const spritesBaseAddress = (this.registers[5] & 0x7e) << 7;
        let height = testBit(1, this.registers[1]) ? 16 : 8;
        let width = 8;
        if (testBit(0, this.registers[1])) {
            // Sprites are zoomed
            height *= 2;
            width *= 2;
        }

        let spritesRendered = 0;
        const baseFrameAddress = scanline * 256 * 4;
        for (let spriteNumber = 0; spriteNumber < 64; spriteNumber++) {
            const y = this.vram[spritesBaseAddress + spriteNumber] + 1;
            if (scanline <= y && y < scanline + height) {
                if (this.screenHeight === 192 && y === 0xd0) break;
                if (spritesRendered === 8) {
                    this.spriteOverflow = true;
                    break;
                }
                spritesRendered++;

                let address = spritesBaseAddress + spriteNumber * 2;
                let x = this.vram[address | 0x80];
                if (testBit(3, this.registers[0])) x -= 8;
                let patternLine = y - scanline;
                if (width === 16) {
                    patternLine = Math.floor(patternLine / 2);
                }
                let patternIndex = this.vram[address | 0x81];
                if (testBit(1, this.registers[1])) {
                    patternIndex = patternLine <= 7 ? patternIndex & 0xfe : patternIndex | 1;
                }
                patternLine &= 7;
                if (testBit(2, this.registers[6])) patternIndex += 256;

                let patternAddress = patternIndex * 32 + patternLine * 4;
                let bitplanes = this.vram.slice(patternAddress, patternAddress + 4);
                if (width === 16) {
                    // Stretch bitplanes to 16 pixels
                    bitplanes = bitplanes.map(bp => {
                        let stretched = 0;
                        let mask = 1;
                        for (let i = 0; i < 8; i++) {
                            stretched |= (bp & mask) << (i * 2);
                            stretched |= (bp & mask) << (i * 2 + 1);
                            mask <<= 1;
                        }
                        return stretched;
                    });
                }

                for (let pixel = 0; pixel < width; pixel++) {
                    if (this.spritePositions.has(x + pixel)) {
                        this.spriteCollision = true;
                        continue;
                    }
                    this.spritePositions.add(x + pixel);
                    if (x + pixel < 0) continue;
                    if (x + pixel >= this.screenWidth) break;

                    const mask = width === 16 ? 0x8000 >> pixel : 0x80 >> pixel;
                    const shift = width - pixel - 1;
                    let colorIndex = 0;
                    for (let bp = 0; bp < 4; bp++) {
                        colorIndex |= ((bitplanes[bp] & mask) >>> shift) << bp;
                    }
                    const [r, g, b] = this.interpolateColor(this.cram[16 + colorIndex]);
                    const frameAddress = baseFrameAddress + ((x + pixel) * 4);
                    this.frameBuffer[frameAddress] = r;
                    this.frameBuffer[frameAddress + 1] = g;
                    this.frameBuffer[frameAddress + 2] = b;
                    this.frameBuffer[frameAddress + 3] = 0xff;
                }
            }
        }
    }

    renderTiles() {
        const scanline = this.vCounter;
        const startCol = 32 - (this.registers[8] >>> 3);
        let hFineScroll = this.registers[8] & 7;
        const startRow = (this.vScrollBuffer >>> 3) % 28;
        let vFineScroll = this.vScrollBuffer & 7;
        const row = Math.floor(scanline / 8);
        let tileRow = (startRow + row) % 28;

        const tilesBaseAddress = (this.registers[2] & 0xe) << 10;
        const frameBaseOffset = scanline * 256 * 4;

        for (let col = 0; col < 32; col++) {
            let tileCol = (startCol + col) & 31;
            if (testBit(6, this.registers[0]) && row <= 1) {
                // Horizontal scroll fixed
                tileCol = col;
                hFineScroll = 0;
            }
            if (testBit(7, this.registers[0]) && col >= 24) {
                // Vertical scroll fixed
                tileRow = row;
                vFineScroll = 0;
            }

            let patternLine = (scanline & 7) + vFineScroll;
            if (patternLine > 7) {
                patternLine &= 7;
                tileRow = (tileRow + 1) % 28;
            }
            let tileEntryAddress = tilesBaseAddress + (tileRow * 64) + (tileCol * 2);
            const lsb = this.vram[tileEntryAddress];
            const msb = this.vram[tileEntryAddress + 1];
            const palette = +testBit(3, msb);
            const priority = testBit(4, msb);
            const hFlip = testBit(1, msb);
            const vFlip = testBit(2, msb);
            if (vFlip) patternLine = 7 - patternLine;
            const patternIndex = ((msb & 1) << 8) | lsb;
            const patternAddress = patternIndex * 32 + (patternLine * 4);
            
            // Pattern line bitplanes
            const bitplanes = this.vram.slice(patternAddress, patternAddress + 4);
            for (let pixel = 0; pixel < 8; pixel++) {
                const x = col * 8 + pixel //+ hFineScroll;
                if (x >= this.screenWidth) break;

                // Shift out bitplanes
                const mask = hFlip ? 1 << pixel : 0x80 >>> pixel;
                const shift = hFlip ? pixel : 7 - pixel;
                let colorIndex = 0;
                for (let bp = 0; bp < 4; bp++) {
                    colorIndex |= ((bitplanes[bp] & mask) << bp) >>> shift;
                }
                const [r, g, b] = this.interpolateColor(this.cram[colorIndex + palette * 16]);

                const frameOffset = frameBaseOffset + x * 4;
                if (priority || !this.spritePositions.has(x)) {
                    this.frameBuffer[frameOffset] = r;
                    this.frameBuffer[frameOffset + 1] = g;
                    this.frameBuffer[frameOffset + 2] = b;
                    this.frameBuffer[frameOffset + 3] = 0xff;
                }
            }
        }
    }

    interpolateColor(color: number) {
        const r = color & 3;
        const g = (color >> 2) & 3;
        const b = (color >> 4) & 3;
        return [r << 5, g << 5, b << 5];
    }

    readControlPort() {
        const status = 
            +this.frameInterruptPending << 7 |
            +this.spriteOverflow << 6 |
            +this.spriteCollision << 5;
        this.firstControlByte = true;
        this.frameInterruptPending = false;
        this.lineInterruptPending = false;
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
            this.codeRegister = value >>> 6 as 0 | 1 | 2 | 3;
            if (this.codeRegister === 0) {
                this.readBuffer = this.vram[this.addressRegister];
                this.incrementAddress();
            }
            else if (this.codeRegister === 2) {
                const idx = value & 0xf;                    
                if (idx < 11) this.registers[idx] = this.addressRegister & 0xff;
            }
        }
    }

    readDataPort(): number{
        this.firstControlByte = true;
        if (this.codeRegister === 3) {
            this.readBuffer = this.cram[this.addressRegister & 0x1f];
        }
        else {
            this.readBuffer = this.vram[this.addressRegister];
        }
        this.incrementAddress();
        return this.readBuffer;
    }

    writeDataPort(value: number) {
        this.firstControlByte = true;
        if (this.codeRegister === 3) {
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

