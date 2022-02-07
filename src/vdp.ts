import { Timing, VideoMode } from "./ui/sms";
import { testBit } from "./util";

export interface BackgroundTile {
    priority: boolean,
    palette: 0 | 1,
    patternNumber: number,
    horizontalFlip: boolean,
    verticalFlip: boolean
}
// Video display processor
export class Vdp {

    widthPixels = 256;
    heightPixels = 192;

    vram = new Uint8Array(2 ** 16);
    cram = new Uint8Array(32);
    registers = new Array<number>(11).fill(0);

    // Writes go to CRAM if set to 3, VRAM otherwise 
    codeRegister: 0 | 1 | 2 | 3 = 0;
    addressRegister = 0;

    // Used for sprite collisions, stores X coordinates for current scanline
    renderedSpritePositions = new Set<number>();

    // Current scanline
    private vCounter = 5;

    // Number of clocks since starting the current scanline
    // 3 times the speed of CPU clock
    hCounter = 0;
    hCounterBuffer = 0;

    lineCounter = 0;
    lineCounterDecremented = false;
    readBuffer = 0;
    vScrollBuffer = 0;

    firstControlByte = true;
    spriteOverflow = false;
    spriteCollision = false;
    frameInterruptPending = false;
    lineInterruptPending = false;
    requestedInterrupt = false;
    firstVSync = true;
    firstHSync = true;

    constructor(
        public videoMode: VideoMode,
        public frameBuffer: Uint8ClampedArray,
        public drawFrame: Function,
        public timing: Timing
    ) {
        this.registers[2] = 0x0e;
        this.registers[5] = 0x7e;
    }

    update(tstates: number) {
        this.hCounter += (tstates * 3);
        this.generateInterrupts();
        if (this.hCounter < (this.timing.tstatesPerScanline * 3)) return;

        // New scanline
        this.hCounter -= (this.timing.tstatesPerScanline * 3);
        this.lineCounterDecremented = false;
        this.firstHSync = true;
        this.firstVSync = true;

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

    generateInterrupts() {
        if (this.firstVSync && this.hCounter >= 607 && this.vCounter === 193) {
            this.firstVSync = false;
            this.frameInterruptPending = true;
        }
        if (this.firstHSync && this.hCounter >= 608 && this.lineCounter === 0 && this.vCounter <= 192) {
            this.firstHSync = false;
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
        if (this.videoMode === VideoMode.NTSC) {
            if (this.vCounter > 0xdb) return this.vCounter - 7;
        }
        else {
            if (this.vCounter > 0xf3) return this.vCounter - 58;
        }
        return(this.vCounter - 1) & 0xff;
    }

    getHCounter(): number {
        return Math.round((this.hCounterBuffer - 94) / 4);
    }

    renderSprites() {
        this.renderedSpritePositions.clear();
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
                let bitplanes = Array.from(this.vram.slice(patternAddress, patternAddress + 4));
                if (spriteWidth === 16) {
                    // Stretch bitplanes from 8 to 16 pixels
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
                    if (this.renderedSpritePositions.has(xPosition) && this.displayEnabled()) {
                        this.spriteCollision = true;
                        continue;
                    }
                    this.renderedSpritePositions.add(xPosition);

                    const [r, g, b] = this.interpolateColor(this.cram[16 + colorIndex]);
                    let frameAddress = frameBaseAddress + xPosition * 4;

                    this.frameBuffer[frameAddress] = r
                    this.frameBuffer[frameAddress + 1] = g;
                    this.frameBuffer[frameAddress + 2] = b;
                    this.frameBuffer[frameAddress + 3] = 0xff;
                }
            }
        }
    }

    renderBackgroundTiles() {
        let scanline = this.vCounter + this.vScrollBuffer;
        if (scanline >= 224) scanline -= 224;
        let row = Math.floor(this.vCounter / 8);
        let tileRow = Math.floor(scanline / 8);

        const startCol = 32 - (this.registers[8] >>> 3);
        let hFineScroll = this.registers[8] & 7;

        const frameBaseAddress = this.vCounter * this.widthPixels * 4;
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
                tileRow = Math.floor(scanline / 8);
            }

            const tile = this.getTile(tileRow, tileCol);
            let tileLine = (scanline & 7);
            if (tile.verticalFlip) tileLine = 7 - tileLine;
            const tileLineAddress = tile.patternNumber * 32 + (tileLine * 4);

            // Pattern line bitplanes
            const bitplanes = this.vram.slice(tileLineAddress, tileLineAddress + 4);
            for (let pixel = 0; pixel < 8; pixel++) {
                const x = col * 8 + pixel + hFineScroll;
                if (x >= this.widthPixels) break;

                // Shift out bitplanes
                const shift = tile.horizontalFlip ? pixel : 7 - pixel;
                let colorIndex = 0;
                for (let bp = 0; bp < 4; bp++) {
                    colorIndex |= ((bitplanes[bp] >> shift) & 1) << bp;
                }
                const [r, g, b] = this.interpolateColor(this.cram[colorIndex + tile.palette * 16]);
                const frameOffset = frameBaseAddress + x * 4;

                if (!this.renderedSpritePositions.has(x) || (tile.priority && colorIndex !== 0)) {
                    this.frameBuffer[frameOffset] = r;
                    this.frameBuffer[frameOffset + 1] = g;
                    this.frameBuffer[frameOffset + 2] = b;
                    this.frameBuffer[frameOffset + 3] = 0xff;
                }
            }

        }
        if (testBit(5, this.registers[0])) {
            // Backdrop 
            const [r, g, b] = this.interpolateColor(this.cram[16 + (this.registers[7] & 0xf)]);
            const frameBaseOffset = this.vCounter * this.widthPixels * 4;
            for (let pixel = 0; pixel < 8; pixel++) {
                this.frameBuffer[frameBaseOffset + pixel * 4] = r;
                this.frameBuffer[frameBaseOffset + pixel * 4 + 1] = g;
                this.frameBuffer[frameBaseOffset + pixel * 4 + 2] = b;
                this.frameBuffer[frameBaseOffset + pixel * 4 + 3] = 0xff;
            }
        }
    }

    getTile(row: number, col: number): BackgroundTile {
        let tileEntryAddress = this.tilesTableAddress() + (row * 64) + (col * 2);
        if (!testBit(0, this.registers[2])) tileEntryAddress &= 0xfbff;

        const lsb = this.vram[tileEntryAddress];
        const msb = this.vram[tileEntryAddress + 1];
        return {
            patternNumber: ((msb & 1) << 8) | lsb,
            palette: +testBit(3, msb) as 0 | 1,
            priority: testBit(4, msb),
            horizontalFlip: testBit(1, msb),
            verticalFlip: testBit(2, msb),
        }
    }

    interpolateColor(color: number) {
        let r = color & 3;
        let g = (color >> 2) & 3;
        let b = (color >> 4) & 3;
        return [(r * 85), (g * 85), (b * 85)];
    }

    readControlPort() {
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

    writeControlPort(value: number) {
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

    writeDataPort(value: number) {
        this.firstControlByte = true;
        this.readBuffer = value;
        if (this.codeRegister === 3) {
            this.cram[this.addressRegister & 0x1f] = value;
        }
        else {
            this.vram[this.addressRegister & 0x3fff] = value;
        }
        this.incrementAddress();
    }

    incrementAddress() {
        this.addressRegister++;
        if (this.addressRegister > 0x3fff) {
            this.addressRegister = 0;
        }
    }

    tilesTableAddress() {
        return (this.registers[2] & 0xe) << 10;
    }

    displayEnabled() {
        return testBit(6, this.registers[1]);
    }
}

