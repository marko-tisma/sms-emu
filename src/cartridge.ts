export class Cartridge {

    ram = new Uint8Array((2 ** 14) * 2);

    constructor(public rom: Uint8Array) {
        if (rom.length % 0x4000 === 512) {
            console.log('rom header trimmed')
            rom = rom.slice(512);
        }
    }
}