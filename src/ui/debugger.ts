import { decode, wordRegisters } from "../decoder";
import { Instruction } from "../instructions";
import { toHex } from "../util";
import { Sms } from "./sms";

export class Debugger {

    breakpoints = new Set();
    memoryHistory: number[] = [];

    constructor(private sms: Sms) {
        document.getElementById('step')!.addEventListener('click', () => this.step());
        document.getElementById('pause')!.addEventListener('click', () => this.pause());
        document.getElementById('continue')!.addEventListener('click', () => this.continue());
        document.getElementById('mem_show')!.addEventListener('click', () => {
           const input = document.getElementById('mem_addr')! as HTMLInputElement;
           const address = parseInt(input.value, 16);
           if (!isNaN(address)) {
               const bytes = this.sms.cpu.bus.readn(address, 10);
               const text = `${toHex(address, 4)}: ${bytes.map(b => `$${toHex(b, 2)}`).join(', ')}`;
               const list = document.getElementById('mem')! as HTMLUListElement;
               this.addLi(list, text);
           }
        });
        document.getElementById('mem_clear')!.addEventListener('click', () => {
            const list = document.getElementById('mem')! as HTMLUListElement;
            list.innerHTML = '';
        });
        this.breakpoints.add(0);
    }

    update() {
        this.updateDisassembly(this.decodeInstructions(1000));
        this.updateState();
    }

    updateDisassembly(instructions: Instruction[]) {
        const list = document.querySelector('#disassembly')!;
        list.innerHTML = '';
        for (const instruction of instructions) {
            const address = instruction.address!;
            const li = document.createElement('li');
            if (this.breakpoints.has(address)) {
                li.classList.add('breakpoint');
            }

            li.setAttribute('id', address.toString());

            li.addEventListener('click', (e: Event) => {
                e.stopPropagation();
                e.preventDefault();
                if (this.breakpoints.has(address)) {
                    this.breakpoints.delete(address);
                    li.classList.remove('breakpoint');
                }
                else {
                    this.breakpoints.add(address);
                    li.classList.add('breakpoint');
                }
            });
            const text = `$${toHex(address, 4)}: ${instruction.disassembly()}`;
            li.appendChild(document.createTextNode(text));
            list.appendChild(li);
            if (address === this.sms.cpu.pc) {
                li.classList.add('current');
                li.scrollIntoView(true);
            }
        }
    }

    addLi(list: HTMLUListElement, text: string) {
        const li = document.createElement('li');
        li.appendChild(document.createTextNode(text));
        list.appendChild(li);
    }

    decodeInstructions(count: number, start?: number): Instruction[] {
        const cpu = this.sms.cpu;
        let startPc = cpu.pc;
        if (start) {
            cpu.pc = start;
        }
        const instructions = [];
        for (let i = 0; i < count; i++) {
          const currPc = cpu.pc;
          const instruction = decode(cpu.next8(), cpu);
          instruction.address = currPc;
          instructions.push(instruction);
        }
        cpu.pc = startPc;
        return instructions;
    }

    updateState() {
        const cpu = this.sms.cpu;
        const cpuList = document.getElementById('cpu')! as HTMLUListElement;
        cpuList.innerHTML = '';
        // for (const rp of wordRegisters) {
        //     this.addLi(cpuList, `${rp}: $${toHex(cpu[rp], 4)}`);
        // }
        let text = wordRegisters.map(rp => `${rp}: $${toHex(cpu[rp], 4)}`).join(', ');
        this.addLi(cpuList, text);
        this.addLi(cpuList, `(hl): $${toHex(cpu['(hl)'], 2)}, (hl + 1): $${toHex(cpu.bus.read8(cpu.hl + 1), 2)}`);

        text = Object.keys(cpu.flags).map(f => `${f}: ${cpu.flags[f]}`).join(', ');
        this.addLi(cpuList, text);

        const vdpList = document.getElementById('vdp')! as HTMLUListElement;
        const vdp = this.sms.cpu.bus.vdp;
        vdpList.innerHTML = '';
        this.addLi(vdpList, `address register: $${toHex(vdp.addressRegister, 4)}`);
        this.addLi(vdpList, `code register: $${toHex(vdp.codeRegister, 4)}`);
        this.addLi(vdpList, `tiles base address: $${toHex(this.sms.renderer.tilesBaseAddress(), 4)}`);
        this.addLi(vdpList, `sprites base address: $${toHex(this.sms.renderer.spritesBaseAddress(), 4)}`);
        this.addLi(vdpList, `vdp registers: ${vdp.registers.map((r, i) => i + ': $' + toHex(r, 2)).join(', ')}`);

        const canvas = document.getElementById('tiles')! as HTMLCanvasElement;
        const ctx = canvas.getContext('2d')!;
        const frameBuffer = ctx.createImageData(256, 192);
        frameBuffer.data.fill(0xff);
        ctx.putImageData(frameBuffer, 0, 0);
        vdp.registers[8] = 0xf8;
        this.sms.renderer.vScrollBuffer = 0;
        this.sms.renderer.positionsRendered.clear();
        const base_addr = this.sms.renderer.tilesBaseAddress();
        for (let line = 0; line < 192; line++) {
            // this.sms.renderer.renderTiles(line, frameBuffer);
            const r = Math.floor(line / 8);
            for (let c = 0; c < 32; c++) {
                let addr = base_addr + (r * 64) + (c * 2);
                const [lsb, msb] = [vdp.vram[addr], vdp.vram[addr + 1]];
                const patt_idx = ((msb & 1) << 8) | lsb;
                const off = (patt_idx * 32) + ((line & 7) * 4);
                const bp1 = vdp.vram[off];
                const bp2 = vdp.vram[off + 1];
                const bp3 = vdp.vram[off + 2];
                const bp4 = vdp.vram[off + 3];
                for (let p = 0; p < 8; p++) {
                    const mask = 0x80 >>> p;
                    let idx = ((bp1 & mask) >>> (7 - p))
                                | (((bp2 & mask) << 1) >>> (7 - p))
                                | (((bp3 & mask) << 2) >>> (7 - p))
                                | (((bp4 & mask) << 3) >>> (7 - p));
                    if (!!(msb & 8)) idx += 16;
                    const r = vdp.cram[idx] & 2;
                    const g = (vdp.cram[idx] >> 2) & 2;
                    const b = (vdp.cram[idx] >> 4) & 2;
                    addr = (line * 256 * 4) + (c * 8 * 4) + (p * 4);
                    frameBuffer.data[addr] = r << 6;
                    frameBuffer.data[addr + 1] = g << 6;
                    frameBuffer.data[addr + 2] = b << 6;
                    frameBuffer.data[addr + 3] = 0xff;
                }
            }
        }
        ctx.putImageData(frameBuffer, 0, 0);
        // ctx.scale(2, 2);
        // ctx.drawImage(ctx.canvas, 0, 0);
        ctx.drawImage(ctx.canvas, 0, 0, ctx.canvas.width * 2, ctx.canvas.height * 2)
    }

    continue() {
        this.breakpoints.delete(this.sms.cpu.pc);
        // requestAnimationFrame(() => this.runFrame);
        // this.step();
        this.sms.animationRequest = requestAnimationFrame(this.sms.runFrame)
    }

    step() {
        const tstates = this.sms.cpu.run(this.sms.cpu.next8());
        this.sms.renderer.update(tstates);
        this.update();
    }

    pause() {
        this.breakpoints.add(this.sms.cpu.pc);
        cancelAnimationFrame(this.sms.animationRequest);
        this.update();
    }
}