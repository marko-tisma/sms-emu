export class Cartridge {

    ram = new Uint8Array((2 ** 14) * 2);

    constructor(public rom: Uint8Array) {

    }
}