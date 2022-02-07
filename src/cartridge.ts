export class Cartridge {

    ram = new Uint8Array((2 ** 14) * 2);
    rom: Uint8Array;
    pages: number;

    constructor(rom: Uint8Array) {
        this.rom = rom;
        if (rom.length % 0x4000 === 512) {
            console.log('rom header trimmed')
            this.rom = rom.slice(512);
        }
        this.pages = rom.length / (2 ** 14);
    }
}