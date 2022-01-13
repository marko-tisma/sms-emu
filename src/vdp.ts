import { testBit } from "./util";

export class Vdp {

    static readonly SCREEN_WIDTH = 256;
    static screenHeight = 192;
    private static readonly SCANLINES_PER_FRAME = 262;
    private static readonly TSTATES_PER_SCANLINE = 228;

    private vram = new Uint8Array(2 ** 16);
    private cram = new Uint8Array(32);
    registers = new Array<number>(11);

    // X coordinates for current scanline
    private spritePositions = new Set<number>();

    addressRegister = 0;
    // Writes go to CRAM if set to 3, VRAM otherwise 
    codeRegister: 0 | 1 | 2 | 3 = 0;

    // Holds the current scanline
    vCounter = 0;
    hCounter = 0;
    private lineCounter = 0;

    private vScrollBuffer = 0;
    private readBuffer = 0;

    firstControlByte = true;
    private spriteOverflow = false;
    private spriteCollision = false;
    private frameInterruptPending = false;
    private vCounterJumped = false;
    requestedInterrupt = false;

	canvasScale = 2;
    imageData: ImageData;

    constructor(private canvas: HTMLCanvasElement) {
        canvas.width = Vdp.SCREEN_WIDTH * this.canvasScale;
        canvas.height = Vdp.screenHeight * this.canvasScale;
		const ctx = canvas.getContext('2d')!;
		ctx.imageSmoothingEnabled = false;
		this.imageData = ctx.createImageData(Vdp.SCREEN_WIDTH, Vdp.screenHeight);
		this.imageData.data.fill(0xff);
		ctx.putImageData(this.imageData, 0, 0);
		ctx.drawImage(
			ctx.canvas, 0, 0,
			ctx.canvas.width * this.canvasScale,
			ctx.canvas.height * this.canvasScale
		);
    }

    run(tstates: number) {
        this.requestedInterrupt = false;
        this.hCounter += tstates;
        if (this.hCounter > Vdp.TSTATES_PER_SCANLINE) {
            // New scanline
            this.hCounter -= Vdp.TSTATES_PER_SCANLINE;
            if (this.vCounter === Vdp.screenHeight) {
                // Entering VBLANK area
                this.frameInterruptPending = true;
                const ctx = this.canvas.getContext('2d')!;
                ctx.putImageData(this.imageData, 0, 0);
                ctx.drawImage(
                    ctx.canvas, 0, 0,
                    ctx.canvas.width * 2,
                    ctx.canvas.height * 2
                );
            }
            if (this.vCounter < Vdp.screenHeight) {
                // Active display area
                this.renderSprites();
                this.renderTiles();
            }
            if (this.vCounter <= Vdp.screenHeight) {
                if (this.lineCounter === 0) {
                    this.requestedInterrupt = testBit(4, this.registers[0]);
                    this.lineCounter = this.registers[10];
                }
                else this.lineCounter--;
            }
            if (Vdp.screenHeight <= this.vCounter) {
                // Vertical refresh
                if (Vdp.screenHeight !== this.vCounter) {
                    this.lineCounter = this.registers[10];
                }
                this.vScrollBuffer = this.registers[9];
            }
            // Update vcounter
            if (this.vCounter === Vdp.SCANLINES_PER_FRAME) {
                // Next frame
                this.vCounter = 0;
                this.vCounterJumped = false;
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
    }

    renderSprites() {
        this.spritePositions.clear();
        let spriteWidth = 8;
        let spriteHeight = testBit(1, this.registers[1]) ? 16 : 8;
        const spritesZoomed = testBit(0, this.registers[1]);
        if (spritesZoomed) {
            spriteHeight *= 2;
            spriteWidth *= 2;
        }

        const scanline = this.vCounter;
        const spriteTableBaseAddress = (this.registers[5] & 0x7e) << 7;
        const frameBuffer = this.imageData.data;
        const frameBaseOffset = scanline * Vdp.SCREEN_WIDTH * 4;
        let spritesRendered = 0;

        for (let spriteNumber = 0; spriteNumber < 64; spriteNumber++) {
            const spriteY = this.vram[spriteTableBaseAddress + spriteNumber] + 1;
            if (Vdp.screenHeight === 192 && spriteY === 0xd1) break;

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
                if (spriteWidth === 16) {
                    patternLine = Math.floor(patternLine / 2);
                }
                let patternIndex = this.vram[tableAddress | 0x81];
                if (testBit(1, this.registers[1])) {
                    patternIndex = patternLine <= 7 ? patternIndex & 0xfe : patternIndex | 1;
                }
                patternLine &= 7;

                if (testBit(2, this.registers[6])) patternIndex += 256;
                let patternAddress = patternIndex * 32 + patternLine * 4;
                let bitplanes = this.vram.slice(patternAddress, patternAddress + 4);
                if (spriteWidth === 16) {
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
                    if (this.spritePositions.has(spriteX + pixel)) {
                        this.spriteCollision = true;
                        continue;
                    }
                    if (spriteX + pixel < 0) continue;
                    if (spriteX + pixel >= Vdp.SCREEN_WIDTH) break;

                    const mask = spriteWidth === 16 ? 0x8000 >> pixel : 0x80 >> pixel;
                    const shift = spriteWidth - pixel - 1;
                    // const mask = 0x80 >>> pixel;
                    // const shift = 7 - pixel;
                    let colorIndex = 0;
                    for (let bp = 0; bp < 4; bp++) {
                        colorIndex |= ((bitplanes[bp] & mask) << bp) >>> shift;
                    }
                    if (colorIndex !== 0) this.spritePositions.add(spriteX + pixel);
                    const [r, g, b] = this.interpolateColor(this.cram[16 + colorIndex]);
                    const frameAddress = frameBaseOffset + ((spriteX + pixel) * 4);
                    frameBuffer[frameAddress] = r;
                    frameBuffer[frameAddress + 1] = g;
                    frameBuffer[frameAddress + 2] = b;
                    frameBuffer[frameAddress + 3] = colorIndex === 0 ? 0 : 0xff;
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
        const frameBuffer = this.imageData.data;
        const frameBaseOffset = (scanline - vFineScroll) * Vdp.SCREEN_WIDTH * 4;

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

            let patternLine = (scanline & 7);
            let tileEntryAddress = tilesBaseAddress + (tileRow * 64) + (tileCol * 2);
            if (!testBit(0, this.registers[2])) tileEntryAddress &= 0xfbff;
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
                const x = col * 8 + pixel + hFineScroll;
                if (x >= Vdp.SCREEN_WIDTH) break;

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
                    frameBuffer[frameOffset] = r;
                    frameBuffer[frameOffset + 1] = g;
                    frameBuffer[frameOffset + 2] = b;
                    frameBuffer[frameOffset + 3] = 0xff;
                }
            }
        }
        if (testBit(5, this.registers[0])) {
            const [r, g, b] = this.interpolateColor(this.cram[this.registers[7]]);
            for (let pixel = 0; pixel < 8; pixel++) {
                frameBuffer[frameBaseOffset + pixel * 4] = r; 
                frameBuffer[frameBaseOffset + pixel * 4 + 1] = g; 
                frameBuffer[frameBaseOffset + pixel * 4 + 2] = b; 
                frameBuffer[frameBaseOffset + pixel * 4 + 3] = 0xff; 
            }
        }
    }

    interpolateColor(color: number) {
        const r = color & 3;
        const g = (color >> 2) & 3;
        const b = (color >> 4) & 3;
        return [r << 7, g << 7, b << 7];
    }

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

