import { Timing, VideoMode } from "./ui/sms";
import { testBit } from "./util";

interface Color {
    r: number,
    g: number,
    b: number
}
// Video display processor
// Reference: https://www.smspower.org/uploads/Development/msvdp-20021112.txt
export class Vdp {

    widthPixels = 256;
    heightPixels = 192;

    vram = new Uint8Array(2 ** 16);
    palette = new Array<Color>(32).fill({r: 0, g: 0, b: 0});
    registers = new Array<number>(11).fill(0);

    // Cache with pre-shifted tiles
    backgroundTilesShifted = new Uint32Array(2 ** 14);

    // Writes go to CRAM if set to 3, VRAM otherwise 
    codeRegister: 0 | 1 | 2 | 3 = 0;
    addressRegister = 0;

    // Used for sprite collisions, stores X coordinates for current scanline
    renderedSpritePositions = new Array<boolean>(300);

    // Current scanline
    private vCounter = 5;

    // Number of clocks since starting the current scanline
    // 3 times the speed of CPU clock
    hCounter = 0;
    hCounterBuffer = 0;

    lineCounter = 0;
    readBuffer = 0;
    vScrollBuffer = 0;

    firstControlByte = true;
    spriteOverflow = false;
    spriteCollision = false;
    frameInterruptPending = false;
    lineInterruptPending = false;
    requestedInterrupt = false;
    firstVInterrupt = true;
    firstHInterrupt = true;

    constructor(
        public videoMode: VideoMode,
        public frameBuffer: Uint8ClampedArray,
        public drawFrame: Function,
        public timing: Timing
    ) {
        this.registers[2] = 0x0e;
        this.registers[5] = 0x7e;
    }

    update(tstates: number): void {
        this.hCounter += (tstates * 3);
        this.generateInterrupts();
        if (this.hCounter < (this.timing.tstatesPerScanline * 3)) return;

        // New scanline
        this.hCounter -= (this.timing.tstatesPerScanline * 3);
        this.firstHInterrupt = true;
        this.firstVInterrupt = true;

        if (this.vCounter <= this.heightPixels) {
            if (this.lineCounter === 0) {
                this.lineCounter = this.registers[10];
            }
            else this.lineCounter--;
        }

        if (this.vCounter < this.heightPixels) {
            // Active display area
            this.renderSprites();
            this.renderBackgroundTiles();
            this.renderBackdrop();
        }

        if (this.vCounter === this.heightPixels + 1 && this.displayEnabled()) {
            this.drawFrame();
        }

        // Update vcounter
        if (this.vCounter === this.timing.scanlinesPerFrame - 1) {
            // Next frame
            this.vCounter = 0;
            this.vScrollBuffer = this.registers[9];
            this.lineCounter = this.registers[10];
            this.lineInterruptPending = false;
        }
        else this.vCounter++;
    }

    generateInterrupts(): void {
        if (this.firstVInterrupt && this.hCounter >= 607 && this.vCounter === 193) {
            this.firstVInterrupt = false;
            this.frameInterruptPending = true;
        }
        if (this.firstHInterrupt && this.hCounter >= 608 && this.lineCounter === 0 && this.vCounter <= 192) {
            this.firstHInterrupt = false;
            this.lineInterruptPending = true;
        }

        this.requestedInterrupt = false;
        if (this.frameInterruptPending && testBit(5, this.registers[1])) {
            this.requestedInterrupt = true;
        }
        if (this.lineInterruptPending && testBit(4, this.registers[0])) {
            this.requestedInterrupt = true;
        }
    }

    getVCounter(): number {
        // Vcounter jumps so it can store more than 256 scanlines in one byte
        if (this.videoMode === VideoMode.NTSC && this.vCounter > 0xdb) {
            return this.vCounter - 7;
        }
        else if (this.videoMode === VideoMode.PAL && this.vCounter > 0xf3) {
             return this.vCounter - 58;
        }
        return(this.vCounter - 1) & 0xff;
    }

    getHCounter(): number {
        return Math.round((this.hCounterBuffer - 94) / 4);
    }

    renderSprites(): void {
        this.renderedSpritePositions = new Array<boolean>(300);
        let spriteWidth = 8;
        const spritesDoubled = testBit(1, this.registers[1]);
        let spriteHeight = spritesDoubled ? 16 : 8;
        const spritesZoomed = testBit(0, this.registers[1]);
        if (spritesZoomed) {
            spriteHeight *= 2;
            spriteWidth *= 2;
        }

        const scanline = this.vCounter;
        const spriteTableBaseAddress = (this.registers[5] & 0x7e) << 7;
        const frameBaseAddress = scanline * this.widthPixels * 4;
        let spritesRendered = 0;

        for (let spriteNumber = 0; spriteNumber < 64; spriteNumber++) {
            let spriteY = this.vram[spriteTableBaseAddress + spriteNumber];
            spriteY = (spriteY + 1) & 0xff;
            if (this.heightPixels === 192 && spriteY === 0xd1) break;

            if (spriteY <= scanline && scanline < spriteY + spriteHeight) {
                if (spritesRendered === 8) {
                    this.spriteOverflow = true;
                    break;
                }
                spritesRendered++;

                let tableAddress = spriteTableBaseAddress + spriteNumber * 2;
                let spriteX = this.vram[tableAddress | 0x80];
                if (testBit(3, this.registers[0])) spriteX -= 8;

                let patternLine = scanline - spriteY;
                if (spritesZoomed) {
                    patternLine = Math.floor(patternLine / 2);
                }
                let patternIndex = this.vram[tableAddress | 0x81];
                if (spritesDoubled) {
                    patternIndex = patternLine <= 7 ? patternIndex & 0xfe : patternIndex | 1;
                }
                patternLine &= 7;

                if (testBit(2, this.registers[6])) patternIndex += 256;
                let patternAddress = patternIndex * 32 + patternLine * 4;
                let bitplanes: number[] | Uint8Array = this.vram.slice(patternAddress, patternAddress + 4);
                if (spriteWidth === 16) {
                    // Stretch bitplanes from 8 to 16 pixels
                    bitplanes = Array.from(bitplanes);
                    bitplanes = bitplanes.map(bp => {
                        let stretched = 0;
                        for (let pixel = 7; pixel >= 0; pixel--) {
                            stretched <<= 1;
                            stretched |= (bp >> pixel) & 1;
                            stretched <<= 1;
                            stretched |= (bp >> pixel) & 1;
                        }
                        return stretched;
                    });
                }

                for (let pixel = 0; pixel < spriteWidth; pixel++) {
                    let xPosition = spriteX + pixel;
                    if (xPosition < 0) continue;
                    if (xPosition >= this.widthPixels) break;

                    const shift = spriteWidth - pixel - 1;
                    let colorIndex = 0;
                    for (let bp = 0; bp < 4; bp++) {
                        colorIndex |= ((bitplanes[bp] >>> shift) & 1) << bp;
                    }
                    // Skip transparent pixels
                    if (colorIndex === 0) continue;
                    if (this.renderedSpritePositions[xPosition] && this.displayEnabled()) {
                        this.spriteCollision = true;
                        continue;
                    }
                    this.renderedSpritePositions[xPosition] = true;

                    const color = this.palette[16 + colorIndex];
                    this.writePixel(frameBaseAddress + xPosition * 4, color);
                }
            }
        }
    }

    renderBackgroundTiles(): void {
        let scanline = this.vCounter + this.vScrollBuffer;
        if (scanline >= 224) scanline -= 224;
        let row = this.vCounter >>> 3;
        let tileRow = scanline >>> 3;

        const startCol = 32 - (this.registers[8] >>> 3);
        let hFineScroll = this.registers[8] & 7;

        const frameBaseAddress = this.vCounter * this.widthPixels * 4;
        const tilesTableBase = this.tilesTableAddress();
        for (let col = 0; col < 32; col++) {
            let tileCol = (startCol + col) & 31;
            if (testBit(6, this.registers[0]) && row <= 1) {
                // Horizontal scroll fixed
                tileCol = col;
                hFineScroll = 0;
            }
            if (testBit(7, this.registers[0]) && col >= 24) {
                // Vertical scroll fixed
                scanline = this.vCounter;
                tileRow = scanline >>> 3;
            }

            let tileEntryAddress = tilesTableBase + (tileRow * 64) + (tileCol * 2);
            if (!testBit(0, this.registers[2])) tileEntryAddress &= 0xfbff;
    
            const lsb = this.vram[tileEntryAddress];
            const msb = this.vram[tileEntryAddress + 1];
            let patternNumber =  ((msb & 1) << 8) | lsb;
            let palette = (+testBit(3, msb) as 0 | 1) << 4;
            let priority = testBit(4, msb);
            let horizontalFlip = testBit(1, msb);
            let verticalFlip = testBit(2, msb);

            let tileLine = (scanline & 7);
            if (verticalFlip) tileLine = 7 - tileLine;

            const tileLineAddress = (patternNumber << 3) + tileLine;
            const lineIndexes = this.backgroundTilesShifted[tileLineAddress];
            for (let pixel = 0; pixel < 8; pixel++) {
                const x = (col << 3) + pixel + hFineScroll;
                if (x >= this.widthPixels) break;

                const shift = horizontalFlip ? pixel << 2 : 28 - (pixel << 2);
                const colorIndex = (lineIndexes >> shift) & 0xf;
                if ((priority && colorIndex) || !this.renderedSpritePositions[x]) {
                    this.writePixel(frameBaseAddress + (x << 2), this.palette[colorIndex + palette]);
                }
            }
        }
    }

    renderBackdrop(): void {
        if (testBit(5, this.registers[0])) {
            const color = this.palette[16 + (this.registers[7] & 0xf)];
            const frameBaseAddress = this.vCounter * this.widthPixels * 4;
            for (let pixel = 0; pixel < 8; pixel++) {
                this.writePixel(frameBaseAddress + pixel * 4, color);
            }
        }
    }

    writePixel(address: number, color: Color): void {
        this.frameBuffer[address] = color.r;
        this.frameBuffer[address + 1] = color.g;
        this.frameBuffer[address + 2] = color.b;
        this.frameBuffer[address + 3] = 0xff;
    }

    interpolateColor(color: number): Color {
        let r = color & 3;
        let g = (color >> 2) & 3;
        let b = (color >> 4) & 3;
        return {r: (r * 85), g: (g * 85), b: (b * 85)};
    }

    readControlPort(): number {
        const status =
            +this.frameInterruptPending << 7 |
            +this.spriteOverflow << 6 |
            +this.spriteCollision << 5;
        this.firstControlByte = true;
        this.frameInterruptPending = false;
        this.lineInterruptPending = false;
        this.requestedInterrupt = false;
        this.spriteCollision = false;
        this.spriteOverflow = false;
        return status;
    }

    writeControlPort(value: number): void {
        value &= 0xff;
        if (this.firstControlByte) {
            this.firstControlByte = false;
            this.addressRegister = (this.addressRegister & 0x3f00) | (value & 0xff);
        }
        else {
            this.firstControlByte = true;
            this.addressRegister = (value & 0x3f) << 8 | (this.addressRegister & 0xff);
            this.codeRegister = value >>> 6 as 0 | 1 | 2 | 3;
            if (this.codeRegister === 0) {
                this.readBuffer = this.vram[this.addressRegister];
                this.incrementAddress();
            }
            else if (this.codeRegister === 2) {
                const idx = value & 0xf;
                if (idx < 11) this.registers[idx] = this.addressRegister & 0xff;
                if (idx === 1 && testBit(5, value) && this.frameInterruptPending) {
                    this.requestedInterrupt = true;
                }
            }
        }
    }

    readDataPort(): number {
        this.firstControlByte = true;
        const ret = this.readBuffer;
        this.readBuffer = this.vram[this.addressRegister];
        this.incrementAddress();
        return ret;
    }

    writeDataPort(value: number): void {
        this.firstControlByte = true;
        this.readBuffer = value;
        if (this.codeRegister === 3) {
            this.palette[this.addressRegister & 0x1f] = this.interpolateColor(value);
        }
        else {
            const address = this.addressRegister & 0x3fff;
            this.vram[address] = value;
            
            const tileLine = address >> 2;
            const bitplane = address & 3;
            this.backgroundTilesShifted[tileLine] &= ~(0x11111111 << bitplane);
            for (let pixel = 0; pixel < 8; pixel++) {
                const mask = ((1 << pixel) & value) << (pixel * 3) << bitplane;
                this.backgroundTilesShifted[tileLine] |= mask;
            }
        }
        this.incrementAddress();
    }

    incrementAddress(): void {
        this.addressRegister++;
        if (this.addressRegister > 0x3fff) {
            this.addressRegister = 0;
        }
    }

    tilesTableAddress(): number {
        return (this.registers[2] & 0xe) << 10;
    }

    displayEnabled(): boolean {
        return testBit(6, this.registers[1]);
    }
}

