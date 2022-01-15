import { Cartridge } from "./cartridge"
import { Vdp } from "./vdp";

export class Bus {

    private static readonly MEM_SIZE = 2 ** 16;
    private static readonly RAM_SIZE = 2 ** 13;
    private static readonly PAGE_SIZE = 2 ** 14;

    private static readonly FRAME_0_OFFSET = 0x0400;
    private static readonly FRAME_1_OFFSET = 0x4000;
    private static readonly FRAME_2_OFFSET = 0x8000;

    private static readonly RAM_OFFSET = 0xc000;
    private static readonly RAM_MIRROR_OFFSET = 0xe000;
    
    // Controls whether frame 2 holds a page from ROM or a page from cartridge battery backed RAM
    private static readonly FRAME_2_CB = 0xfffc;

    // Writing to these addresses determines which ROM page will be held at which frame
    private static readonly FRAME_0_FCR = 0xfffd;
    private static readonly FRAME_1_FCR = 0xfffe;
    private static readonly FRAME_2_FCR = 0xffff;

    private ram = new Uint8Array(Bus.RAM_SIZE);
    private ports = new Uint8Array(256);

    private framePages = [0, 1, 2];

    private ramInFrame2 = false;
    private frame2RamPage = 0;

    constructor(private cartridge: Cartridge, public vdp: Vdp) {}
    
    read8(address: number): number {
        // First 1KB is always from page 0
        if (address < Bus.FRAME_0_OFFSET) {
            return this.cartridge.rom[address];
        }
        else if (address < Bus.RAM_OFFSET) {
            // Reading from cartridge ROM, need to determine what pages are currently mapped
            const frame = Math.floor(address / Bus.PAGE_SIZE);
            address -= frame * Bus.PAGE_SIZE;
            if (frame === 2 && this.ramInFrame2) {
                return this.cartridge.ram[this.frame2RamPage * Bus.PAGE_SIZE + address];
            }
            const page = this.framePages[frame];
            return this.cartridge.rom[page * Bus.PAGE_SIZE + address];
        }
        else if (address < Bus.RAM_MIRROR_OFFSET) {
            return this.ram[address - Bus.RAM_OFFSET];
        }
        else if (address < Bus.FRAME_2_CB) {
            return this.ram[address - Bus.RAM_MIRROR_OFFSET];
        }
        else if (address < Bus.MEM_SIZE) {
            return this.framePages[address - Bus.FRAME_0_FCR];
        }
        return 0;
    }

    write8(address: number, value: number): void {
        // Can write to ROM area only if cartridge RAM is mapped to frame 2
        if (address < Bus.RAM_OFFSET) {
            if (this.ramInFrame2 && Bus.FRAME_2_OFFSET <= address) {
                address -= Bus.FRAME_2_OFFSET;
                this.cartridge.ram[this.frame2RamPage * Bus.PAGE_SIZE + address] = value;
            }
        } 
        else if (address < Bus.RAM_MIRROR_OFFSET) {
            this.ram[address - Bus.RAM_OFFSET] = value;
        } 
        else if (address < Bus.FRAME_2_CB) {
            this.ram[address - Bus.RAM_MIRROR_OFFSET] = value;
        }
        else if (address === Bus.FRAME_2_CB) {
            this.ramInFrame2 = (value & 0x08) > 0;
            this.frame2RamPage = (value & 0x04) >>> 2; 
        }
        else if (address < Bus.MEM_SIZE) {
            this.framePages[address - Bus.FRAME_0_FCR] = value & 0x3f;
        }
    }

    read16(address: number, littleEndian=true): number {
        if (littleEndian) {
            return (this.read8(address + 1) << 8) + this.read8(address);
        }
        return (this.read8(address) << 8) + this.read8(address + 1);
    }

    write16(address: number, value: number): void {
        this.write8(address, value & 0xff);
        this.write8(address + 1, value >>> 8);
    }

    readn(address: number, count: number) {
        const values = [];
        for (let i = 0; i < count; i++) {
            values.push(this.read8(address + i));
        }
        return values;
    }

    in(port: number) {
        port &= 0xff;
        if (port >>> 6 === 1) {
            if (port & 1) return this.vdp.hCounter;
            // else return (this.vdp.vCounter - 64) & 0xff;
            else return this.vdp.vCounter;
        }
        if (port >>> 6 === 2) {
            if (port & 1) return this.vdp.readControlPort();
            return this.vdp.readDataPort();
        }
        return this.ports[port];
    }

    out(port: number, value: number) {
        port &= 0xff;
        if (port >>> 6 === 2) {
            if (port & 1) this.vdp.writeControlPort(value);
            else this.vdp.writeDataPort(value);
        }
        this.ports[port] = value;
    }
}
