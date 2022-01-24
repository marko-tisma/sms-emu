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

    // Timing information taken from https://www.smspower.org/forums/8161-SMSDisplayTiming
    static readonly SCANLINES_PER_FRAME = 262;
    static readonly TSTATES_PER_SCANLINE = 228;

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

    vCounter = 0;
    hCounter = 0;
    lineCounter = 0;
    vScrollBuffer = 0;
    hCountBuffer = 0;
    readBuffer = 0;

    firstControlByte = true;
    spriteOverflow = false;
    spriteCollision = false;
    frameInterruptPending = false;
    lineInterruptPending = false;
    vCounterJumped = false;
    requestedInterrupt = false;

    private imageData: ImageData;
    private canvasScale = 2;

    constructor(private canvas: HTMLCanvasElement) {
        canvas.width = this.widthPixels * this.canvasScale;
        canvas.height = this.heightPixels * this.canvasScale;
        const ctx = canvas.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;
        this.imageData = ctx.createImageData(this.widthPixels, this.heightPixels);
        this.imageData.data.fill(0xff);
        this.drawFrame();
        this.registers[2] = 0x0e;
        this.registers[5] = 0x7e;
    }

    drawFrame() {
        const ctx = this.canvas.getContext('2d')!;
        ctx.putImageData(this.imageData, 0, 0);
        ctx.drawImage(
            ctx.canvas, 0, 0,
            ctx.canvas.width * this.canvasScale,
            ctx.canvas.height * this.canvasScale
        );
    }

    update(tstates: number) {
        this.hCounter += tstates;
        if (this.hCounter <= Vdp.TSTATES_PER_SCANLINE) return;

        // New scanline
        this.hCounter -= Vdp.TSTATES_PER_SCANLINE;
        this.generateInterrupts();

        if (this.vCounter < this.heightPixels) {
            // Active display area
            this.renderSprites();
            this.renderBackgroundTiles();
        }
        if (this.vCounter === this.heightPixels + 1 && this.displayEnabled()) {
            this.drawFrame();
        }

        // Update vcounter
        if (this.vCounter === 0xff) {
            // Next frame
            this.vCounter = 0;
            this.vCounterJumped = false;
            this.vScrollBuffer = this.registers[9];
            this.lineCounter = this.registers[10];
        }
        else if (!this.vCounterJumped && this.vCounter === 0xda) {
            this.vCounterJumped = true;
            this.vCounter = 0xd5;
        }
        else this.vCounter++;
    }

    generateInterrupts() {
        this.requestedInterrupt = false;
        if (this.vCounter <= this.heightPixels) {
            if (this.lineCounter === 0) {
                this.lineInterruptPending = true;
                this.lineCounter = this.registers[10];
            }
            else this.lineCounter--;
        }
        if (this.vCounter === this.heightPixels) {
            this.frameInterruptPending = true;
        }
        if (this.frameInterruptPending && testBit(5, this.registers[1])) {
            this.requestedInterrupt = true;
        }
        if (this.lineInterruptPending && testBit(4, this.registers[0])) {
            this.requestedInterrupt = true;
        }
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
        const frameBuffer = this.imageData.data;
        const frameBaseOffset = scanline * this.widthPixels * 4;
        let spritesRendered = 0;

        for (let spriteNumber = 0; spriteNumber < 64; spriteNumber++) {
            const spriteY = this.vram[spriteTableBaseAddress + spriteNumber] + 1;
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
                let bitplanes = this.vram.slice(patternAddress, patternAddress + 4);
                if (spritesZoomed) {
                    // Stretch bitplanes from 8 to 16 pixels
                    bitplanes = bitplanes.map(bp => {
                        let stretched = 0;
                        let mask = 1;
                        for (let pixel = 0; pixel < 8; pixel++) {
                            stretched |= (bp & mask) << (pixel * 2);
                            stretched |= (bp & mask) << (pixel * 2 + 1);
                            mask <<= 1;
                        }
                        return stretched;
                    });
                }

                for (let pixel = 0; pixel < spriteWidth; pixel++) {
                    const xPosition = spriteX + pixel;
                    if (xPosition < 0) continue;
                    if (xPosition >= this.widthPixels) break;

                    const mask = spriteWidth === 16 ? 0x8000 >> pixel : 0x80 >> pixel;
                    const shift = spriteWidth - pixel - 1;
                    let colorIndex = 0;
                    for (let bp = 0; bp < 4; bp++) {
                        colorIndex |= ((bitplanes[bp] & mask) << bp) >>> shift;
                    }
                    // Skip transparent pixels
                    if (colorIndex === 0) continue;
                    if (this.renderedSpritePositions.has(xPosition) && this.displayEnabled()) {
                        this.spriteCollision = true;
                        continue;
                    }
                    this.renderedSpritePositions.add(xPosition);

                    const [r, g, b] = this.interpolateColor(this.cram[16 + colorIndex]);
                    const frameAddress = frameBaseOffset + xPosition * 4;
                    frameBuffer[frameAddress] = r;
                    frameBuffer[frameAddress + 1] = g;
                    frameBuffer[frameAddress + 2] = b;
                    frameBuffer[frameAddress + 3] = 0xff;
                }
            }
        }
    }

    renderBackgroundTiles() {
        let scanline = (this.vCounter + this.vScrollBuffer) % 224;
        let tileRow = Math.floor(scanline / 8);
        const startCol = 32 - (this.registers[8] >>> 3);
        let hFineScroll = this.registers[8] & 7;
        const frameBuffer = this.imageData.data;

        let row = Math.floor(this.vCounter / 8);
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
                const frameBaseOffset = this.vCounter * this.widthPixels * 4;
                const frameOffset = frameBaseOffset + x * 4;

                if (!this.renderedSpritePositions.has(x) || (tile.priority && colorIndex !== 0)) {
                    // if (tile.priority || !this.renderedSpritePositions.has(x)) {
                    if (tile.priority && this.renderedSpritePositions.has(x) && colorIndex === 0) continue;
                    frameBuffer[frameOffset] = r;
                    frameBuffer[frameOffset + 1] = g;
                    frameBuffer[frameOffset + 2] = b;
                    frameBuffer[frameOffset + 3] = 0xff;
                }
            }

        }
        if (testBit(5, this.registers[0])) {
            // Backdrop 
            const [r, g, b] = this.interpolateColor(this.cram[16 + (this.registers[7] & 0xf)]);
            const frameBaseOffset = this.vCounter * this.widthPixels * 4;
            for (let pixel = 0; pixel < 8; pixel++) {
                frameBuffer[frameBaseOffset + pixel * 4] = r;
                frameBuffer[frameBaseOffset + pixel * 4 + 1] = g;
                frameBuffer[frameBaseOffset + pixel * 4 + 2] = b;
                frameBuffer[frameBaseOffset + pixel * 4 + 3] = 0xff;
            }
        }
    }

    getPatternBp(patternNumber: number) {
        const address = patternNumber * 32;
        return this.vram.slice(address, address + 32);
    }

    getPattern(patternNumber: number) {
        const address = patternNumber * 32;
        const patternColorIndexes = new Uint8Array(64);
        for (let line = 0; line < 8; line++) {
            const bitplanes = this.vram.slice(address + (line * 4), address + (line * 4) + 4);
            for (let pixel = 0; pixel < 8; pixel++) {
                const shift = 7 - pixel;
                let colorIndex = 0;
                for (let bp = 0; bp < 4; bp++) {
                    colorIndex |= ((bitplanes[bp] >> shift) & 1) << bp;
                }
                patternColorIndexes[line * 8 + pixel] = colorIndex;
            }
        }
        return patternColorIndexes;
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

    tilesTableAddress() {
        return (this.registers[2] & 0xe) << 10;
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

    displayEnabled() {
        return testBit(6, this.registers[1]);
    }
}

