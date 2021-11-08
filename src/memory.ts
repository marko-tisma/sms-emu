export class Memory {

    private readonly MEM_SIZE = 2 ** 16;
    private readonly RAM_SIZE = 2 ** 13;
    private readonly PAGE_SIZE = 2 ** 14;

    private readonly FRAME_0_OFFSET = 0x0400;
    private readonly FRAME_1_OFFSET = 0x4000;
    private readonly FRAME_2_OFFSET = 0x8000;

    private readonly RAM_OFFSET = 0xc000;
    private readonly RAM_MIRROR_OFFSET = 0xe000;
    
    // Controls whether frame 2 holds a page from ROM or a page from cartridge battery backed RAM
    private readonly FRAME_2_CB = 0xfffc;

    // Writing to these addresses determines which ROM page will be held at which frame
    private readonly FRAME_0_FCR = 0xfffd;
    private readonly FRAME_1_FCR = 0xfffe;
    private readonly FRAME_2_FCR = 0xffff;

    private isFrame2Ram = false;
    private frame2RamPage = 0;
    private framePages = new Array<number>(3);

    private ram = new Uint8Array(this.RAM_SIZE);
    private cartridgeRam = new Uint8Array(this.PAGE_SIZE * 2);

    constructor(private cartridgeRom: Uint8Array) {
        this.framePages[0] = 0;
        this.framePages[1] = 1;
        this.framePages[2] = 2;
    }

    read8(address: number): number {
        // First 1KB is always from page 0
        if (address < this.FRAME_0_OFFSET) {
            return this.cartridgeRom[address];
        }
        else if (address < this.RAM_OFFSET) {
            // Reading from cartridge ROM, need to determine what pages are currently mapped
            const frame = Math.floor(address / this.PAGE_SIZE);
            address -= frame * this.PAGE_SIZE;
            if (frame == 2 && this.isFrame2Ram) {
                return this.cartridgeRam[this.frame2RamPage * this.PAGE_SIZE + address];
            }
            const page = this.framePages[frame];
            return this.cartridgeRom[page * this.PAGE_SIZE + address];
        }
        else if (address < this.RAM_MIRROR_OFFSET) {
            return this.ram[address - this.RAM_OFFSET];
        }
        else if (address < this.FRAME_2_CB) {
            return this.ram[address - this.RAM_MIRROR_OFFSET];
        }
        else if (address < this.MEM_SIZE) {
            return this.framePages[address - this.FRAME_0_FCR];
        }
        return 0;
    }

    write8(address: number, value: number): void {
        // Can write to ROM area only if cartridge RAM is mapped to frame 2
        if (address < this.RAM_OFFSET) {
            if (this.isFrame2Ram && this.FRAME_2_OFFSET <= address) {
                address -= this.FRAME_2_OFFSET;
                this.cartridgeRam[this.frame2RamPage * this.PAGE_SIZE + address] = value;
            }
        } 
        else if (address < this.RAM_MIRROR_OFFSET) {
            this.ram[address - this.RAM_OFFSET] = value;
        } 
        else if (address < this.FRAME_2_CB) {
            this.ram[address - this.RAM_MIRROR_OFFSET] = value;
        }
        else if (address === this.FRAME_2_CB) {
            this.isFrame2Ram = (value & 0x08) > 0;
            this.frame2RamPage = (value & 0x04) >> 2; 
        }
        else if (address < this.MEM_SIZE) {
            this.framePages[address - this.FRAME_0_FCR] = value & 0xff;
        }
    }

    read16(address: number): number {
        return (this.read8(address + 1) << 8) + this.read8(address);
    }

    write16(address: number, value: number): void {
        this.write8(address, value & 0xff);
        this.write8(address + 1, value >> 8);
    }
}
