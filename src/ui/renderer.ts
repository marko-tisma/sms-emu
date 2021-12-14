import { testBit } from "../util";
import { Vdp } from "../vdp";
import { Sms } from "./sms";

interface Sprite {
    patternIndex: number
    x: number, 
    y: number,
    height: number,
    width: number
}

interface Tile {
    patternIndex: number
    hFlip: boolean,
    vFlip: boolean,
    hasPriority: boolean,
    palette: 0 | 1
}

export class Renderer {

    SCANLINES_PER_FRAME = 262;
    TSTATES_PER_SCANLINE = Math.ceil(Sms.cpuClock / 60 / this.SCANLINES_PER_FRAME)

    screenWidth = 256;
    screenHeight = 192;

    vScrollBuffer = 0; 

    vCounterJump = false;
    lineCounter = 0;

    canvas: HTMLCanvasElement;
    frameBuffer: ImageData;

    positionsRendered = new Set();

    constructor(private vdp: Vdp) {
        this.canvas = document.getElementById('screen')! as HTMLCanvasElement;
        this.canvas.width = this.screenWidth;
        this.canvas.height = this.screenHeight;
        const ctx = this.canvas.getContext('2d')!;
        this.frameBuffer = ctx?.createImageData(this.screenWidth, this.screenHeight);
        this.frameBuffer.data.fill(0x55);
        ctx.putImageData(this.frameBuffer, 0, 0);
    }

    update(tstates: number) {
        this.vdp.hCounter += tstates;
        if (this.vdp.hCounter > this.TSTATES_PER_SCANLINE) {
            // New scanline
            this.vdp.hCounter -= this.TSTATES_PER_SCANLINE;

            if (this.vdp.vCounter === 255) {
                this.vCounterJump = false;
                this.vdp.vCounter = 0;
            }
            else if (this.vdp.vCounter === 0xde && !this.vCounterJump) {
                this.vCounterJump = true;
                this.vdp.vCounter = 0xd5;
            }
            else this.vdp.vCounter++;

            if (this.vdp.vCounter === this.screenHeight) {
                this.vdp.frameInterruptPending = true; 
                if (this.displayEnabled()) {
                    this.renderFrame();
                }
            }

            if (this.screenHeight <= this.vdp.vCounter) {
                // Vertical blank area
                if (this.vdp.vCounter !== this.screenHeight) {
                    this.lineCounter = this.getLineCounter(); 
                }
                this.vScrollBuffer = this.getVScroll()
            }

            if (this.vdp.vCounter <= this.screenHeight) {
                if (this.vdp.vCounter !== this.screenHeight) {
                    this.renderScanline(this.vdp.vCounter);
                } 
                if (this.lineCounter === 0) {
                    this.lineCounter = this.getLineCounter();
                    this.vdp.lineInterruptPending = true;
                } 
                else this.lineCounter--;
            }
        }

        if (this.vdp.frameInterruptPending && this.frameInterruptsEnabled()) {
            this.vdp.requestedInterrupt = true;
        }

        if (this.vdp.lineInterruptPending && this.lineInterruptsEnabled()) {
            this.vdp.requestedInterrupt = true;
        }
    }

    renderFrame() {
        this.canvas.getContext('2d')!.putImageData(this.frameBuffer, 0, 0);
    }

    renderScanline(scanline: number) {
        this.positionsRendered.clear();
        this.renderSprites(scanline);
        this.renderTiles(scanline, this.frameBuffer);
    }

    renderSprites(scanline: number) {
        let spritesRendered = 0;
        const entries = this.getSpriteEntries();

        let baseBufferOffset = scanline * this.screenWidth * 4;

        for (let spriteNumber = 0; spriteNumber < 64; spriteNumber++) {
            const sprite = entries[spriteNumber];
            if (sprite.y === 0xd0 && this.screenHeight === 192) break;
            if (sprite.y <= scanline && scanline < sprite.y + sprite.height) {
                if (spritesRendered === 8) {
                    this.vdp.spriteOverflow = true;
                    break;
                }
                spritesRendered++;
                // Render
                let patternLine = scanline - sprite.y;
                if (sprite.height >= 16 && patternLine < sprite.height / 2) {
                    sprite.patternIndex &= 0xfe;
                }
                if (this.spritesDoubled()) {
                    patternLine = Math.floor(patternLine / 2);
                } 
                let colorIndexes = this.getSpritePatternLine(sprite.patternIndex, patternLine);
                if (this.spritesDoubled()) {
                    colorIndexes = this.zoom(colorIndexes, 2);
                } 

                for (let pixel = 0; pixel < colorIndexes.length; pixel++) {
                    const x = sprite.x + pixel * 4;
                    if (this.positionsRendered.has(x)) {
                        this.vdp.spriteCollision = true;
                        continue;
                    }
                    this.positionsRendered.add(x);
                    if (x < 0) continue;
                    if (this.screenWidth <= x) break;

                    const color = this.getColor(colorIndexes[pixel]);
                    this.frameBuffer.data[baseBufferOffset + x] = color[0];
                    this.frameBuffer.data[baseBufferOffset + x + 1] = color[1];
                    this.frameBuffer.data[baseBufferOffset + x + 2] = color[2];
                    this.frameBuffer.data[baseBufferOffset + x + 3] = 1;
                }
            }
        }
    }


    renderTiles(scanline: number, frameBuffer: ImageData) {
        const startingColumn = 32 - (this.getHScroll() >>> 3);

        const startingRow = this.vScrollBuffer >>> 3;
        let vFineScroll = this.vScrollBuffer & 7;

        const row = Math.floor(scanline / 8);
        // let tableRow = startingRow;
        let tableRow = (startingRow + row) & 31;
        if ((scanline & 7) + vFineScroll >= 8) {
            tableRow++;
            // vFineScroll = (scanline & 7) + vFineScroll - 8;
        }

        let baseBufferOffset = scanline * this.screenWidth * 4;

        for (let column = 0; column < 32; column++) {
            let tile: Tile;

            let tableColumn = (startingColumn + column) & 31;
            let hFineScroll = this.getHScroll() & 7;
            if (this.hScrollFixed() && scanline <= 15) {
                tableColumn = column;
                hFineScroll = 0;
            } 

            if (this.vScrollFixed() && 24 <= column && column <= 31) {
                tableRow = row;
                vFineScroll = 0;
            } 
            tile = this.getTile(tableRow, tableColumn);

            let patternLine = (scanline + vFineScroll) & 7;
            const colorIndexes = this.getTilePatternLine(tile, patternLine);

            const baseX = column * 8 + hFineScroll;
            for (let pixel = 0; pixel < colorIndexes.length; pixel++) {
                const x = baseX + pixel + 4;
                if (x < 0) continue;
                if (this.screenWidth <= x) break;
                if (!this.positionsRendered.has(x) || tile.hasPriority) {
                    const color = this.getColor(colorIndexes[pixel]);
                    frameBuffer.data[baseBufferOffset + x] = color[0];
                    frameBuffer.data[baseBufferOffset + x + 1] = color[1];
                    frameBuffer.data[baseBufferOffset + x + 2] = color[2];
                    frameBuffer.data[baseBufferOffset + x + 3] = 1;
                }
            }
        }
    }
    
    zoom(colorIndexes: number[], factor: number): number[]{
        return colorIndexes.flatMap(c => {
            const multiple = [];
            for (let i = 0; i < factor; i++) multiple.push(c);
            return multiple;
        });
    }

    getColor(index: number) {
        const color = this.vdp.cram[index];
        const r = color & 2;
        const g = (color >> 2) & 2;
        const b = (color >> 4) & 2;
        return [r * 16, g * 16, b * 16];
    }

    bitplaneToColorIndexes(address: number, indexOffset: number, reverse: boolean) {
        const colorIndexes = new Array<number>(8);
        for (let pixel = 0; pixel < 8; pixel++) {
            const mask = 0x80 >>> pixel;
            let index = 0;
            for (let bitplane = 0; bitplane < 4; bitplane++) {
                const bit = (this.vdp.vram[address + bitplane] & mask) >>> (7 - pixel);
                index |= bit << bitplane; 
            }
            if (reverse) colorIndexes[7 - pixel] = index + indexOffset;
            else colorIndexes[pixel] = index + indexOffset;
        }
        return colorIndexes;
    }

    getTile(row: number, column: number): Tile {
        row &= 0x1f;
        column &= 0x1f;
        let address = this.tilesBaseAddress();
        address |= row << 6;
        address |= column << 1;
        address &= (this.vdp.registers[2] & 1) << 10;
        const lsb = this.vdp.vram[address];
        const msb = this.vdp.vram[address + 1];
        return {
            patternIndex: ((msb & 1) << 8) | lsb,
            hFlip: testBit(1, msb),
            vFlip: testBit(2, msb),
            palette: +testBit(3, msb) as 0 | 1,
            hasPriority: testBit(4, msb)
        }
    }

    getTilePatternLine(tile: Tile, line: number): number[] {
        line &= 7;
        if (tile.vFlip) line = 7 - line;
        let address = tile.patternIndex << 5;
        address |= line << 2;
        const colorIndexes = this.bitplaneToColorIndexes(address, tile.palette << 4, tile.hFlip);
        return colorIndexes;
    }

    getSpriteEntries(): Sprite[] {
        const sprites = new Array<Sprite>(64);
        const baseAddress = this.spritesBaseAddress();
        for (let i = 0; i < sprites.length; i++) {
            const address = baseAddress | (i << 1);
            let x = this.vdp.vram[address | 0x80];
            if (testBit(3, this.vdp.registers[0])) x -= 8;
            let height = this.getSpriteHeight();
            if (this.spritesDoubled()) height *= 2;
            sprites[i] = {
                y: this.vdp.vram[address] + 1,
                x: x,
                patternIndex: this.vdp.vram[address | 0x81],
                height: height,
                width: this.spritesDoubled() ? 16 : 8
            }
        }
        return sprites;
    }

    getSpritePatternLine(patternIndex: number, line: number): number[] {
        patternIndex &= 0xff;
        line &= 7;
        let address = (+testBit(2, this.vdp.registers[6])) << 13;
        address |= patternIndex << 5;
        address |= line << 2;
        return this.bitplaneToColorIndexes(address, 16, false);
    }

    spritesBaseAddress() {
        return (this.vdp.registers[5] & 0x7e) << 7;
    }

    tilesBaseAddress() {
        return (this.vdp.registers[2] & 0xe) << 10;
    }

    getBackdropColor() {
        return this.vdp.registers[7] & 0xf;
    }

    getHScroll() {
        return this.vdp.registers[8] & 0xff;
    }

    getVScroll() {
        return this.vdp.registers[9] & 0xff;
    }

    getLineCounter() {
        return this.vdp.registers[10] & 0xff;
    }

    getSpriteHeight() {
        return testBit(1, this.vdp.registers[1]) ? 16 : 8;
    }

    spritesDoubled() {
        return testBit(0, this.vdp.registers[1]);
    }

    hScrollFixed() {
        return testBit(6, this.vdp.registers[0]);
    }

    vScrollFixed() {
        return testBit(7, this.vdp.registers[0]);
    }

    displayEnabled() {
        return testBit(6, this.vdp.registers[1]);
    }

    lineInterruptsEnabled() {
        return testBit(4, this.vdp.registers[0]);
    }

    frameInterruptsEnabled() {
        return testBit(5, this.vdp.registers[1]);
    }
}