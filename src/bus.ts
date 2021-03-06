import { Cartridge } from "./cartridge"
import { Sound } from "./sound";
import { Vdp } from "./vdp";

export class Bus {

    static readonly MEMORY_SIZE = 2 ** 16;
    static readonly PAGE_SIZE = 2 ** 14;
    static readonly RAM_SIZE = 2 ** 13;

    // Each frame is mapped to one ROM page
    // First 1KB is always mapped to page 0
    // Frame 2 can also be used for battery backed cartridge RAM
    static readonly FRAME_0_OFFSET = 0x0400;
    static readonly FRAME_1_OFFSET = 0x4000;
    static readonly FRAME_2_OFFSET = 0x8000;

    static readonly RAM_OFFSET = 0xc000;
    static readonly RAM_MIRROR_OFFSET = 0xe000;

    // This memory location controls if frame 2 is mapped to cartridge RAM
    // and which RAM page is used
    static readonly FRAME_2_CB_OFFSET = 0xfffc;

    // Control registers, writing to these locations controls which ROM page
    // is mapped to which frame, default is [0, 1, 2]
    static readonly FRAME_0_FCR_OFFSET = 0xfffd;
    static readonly FRAME_1_FCR_OFFSET = 0xfffe;
    static readonly FRAME_2_FCR_OFFSET = 0xffff;

    framePages = [0, 1, 2];
    ramInFrame2 = false;
    frame2RamPage = 0;

    ram = new Uint8Array(Bus.RAM_SIZE);
    ports = new Uint8Array(256);

    // Port registers
    ioControl = 0xff;
    memoryControl = 0xab;
    
    constructor(private cartridge: Cartridge, public vdp: Vdp, public sound: Sound) { }

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
                address += this.frame2RamPage * Bus.PAGE_SIZE;
                return this.cartridge.ram[address];
            }
            let page = this.framePages[frame];
            if (page >= this.cartridge.pages) {
                page &= this.cartridge.pages - 1;
            }
            return this.cartridge.rom[page * Bus.PAGE_SIZE + address];
        }
        else if (address < Bus.RAM_MIRROR_OFFSET) {
            return this.ram[address - Bus.RAM_OFFSET];
        }
        else if (address < Bus.FRAME_2_CB_OFFSET) {
            return this.ram[address - Bus.RAM_MIRROR_OFFSET];
        }
        else if (address === Bus.FRAME_2_CB_OFFSET) {
            return (+this.ramInFrame2 << 3) | (this.frame2RamPage << 2);
        }
        else if (address < Bus.MEMORY_SIZE) {
            return this.framePages[address - Bus.FRAME_0_FCR_OFFSET];
        }
        return 0;
    }

    write8(address: number, value: number): void {
        if (address < Bus.RAM_OFFSET) {
            // Can write to ROM area only if cartridge RAM is mapped to frame 2
            if (this.ramInFrame2 && Bus.FRAME_2_OFFSET <= address) {
                address -= Bus.FRAME_2_OFFSET;
                address += this.frame2RamPage * Bus.PAGE_SIZE;
                this.cartridge.ram[address] = value;
            }
        }
        else if (address < Bus.RAM_MIRROR_OFFSET) {
            this.ram[address - Bus.RAM_OFFSET] = value;
        }
        else if (address < Bus.FRAME_2_CB_OFFSET) {
            this.ram[address - Bus.RAM_MIRROR_OFFSET] = value;
        }
        else if (address === Bus.FRAME_2_CB_OFFSET) {
            this.ramInFrame2 = !!(value & 0x08);
            this.frame2RamPage = (value & 0x04) >>> 2;
            this.ram[0x1ffc] = value;
        }
        else if (address < Bus.MEMORY_SIZE) {
            this.framePages[address - Bus.FRAME_0_FCR_OFFSET] = value & 0xff;
            this.ram[address - Bus.FRAME_0_FCR_OFFSET + 0x1ffd] = value;
        }
    }

    read16(address: number): number {
        return (this.read8(address + 1) << 8) + this.read8(address);
    }

    write16(address: number, value: number): void {
        this.write8(address, value & 0xff);
        this.write8(address + 1, value >>> 8);
    }

    readn(address: number, count: number): number[] {
        const values = [];
        for (let i = 0; i < count; i++) {
            values.push(this.read8(address + i));
        }
        return values;
    }

    in(port: number): number {
        switch (port & 0xc1) {
            case 0x00:
            case 0x01: return 0xff;
            case 0x40: return this.vdp.getVCounter();
            case 0x41: return this.vdp.getHCounter();
            case 0x80: return this.vdp.readDataPort();
            case 0x81: return this.vdp.readControlPort();
            case 0xc0: return this.ports[0xdc];
            case 0xc1: return (
                // Export console 
                (this.ioControl & 0x80) | 
                ((this.ioControl & 0x20) << 1) | 
                ((this.ports[0xdd]) & 0x3f)
            );
            default: return 0;
        }
    }

    out(port: number, value: number): void {
        switch (port & 0xc1) {
            case 0x00:
                this.memoryControl = value;
                break;
            case 0x01:
                const th = this.ioControl & 0xa0;
                this.ioControl = value;
                if (th === 0 && (this.ioControl & 0xa0)) {
                    this.vdp.hCounterBuffer = this.vdp.hCounter;
                }
                break;
            case 0x40:
            case 0x41:
                this.sound!.write(value);
                break;
            case 0x80:
                this.vdp.writeDataPort(value);
                break;
            case 0x81:
                this.vdp.writeControlPort(value);
                break;
            default:
                this.ports[port] = value;
                break;
        }
    }
}
