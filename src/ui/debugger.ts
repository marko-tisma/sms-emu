import { decode, wordRegisters } from "../decoder";
import { Instruction } from "../instructions";
import { Sms } from "./sms";
import { toHex, testBit } from "../util";

export class Debugger {

    breakpoints = new Set();

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
        this.addLi(vdpList, `vdp registers: ${vdp.registers.map((r, i) => i + ': $' + toHex(r, 2)).join(', ')}`);
    }

    continue() {
        // this.breakpoints.delete(this.sms.cpu.pc);
        // requestAnimationFrame(() => this.runFrame);
        this.step();
        this.sms.animationRequest = requestAnimationFrame(this.sms.runFrame)
    }

    step() {
        const tstates = this.sms.cpu.run(this.sms.cpu.next8());
        this.update();
    }

    pause() {
        this.breakpoints.add(this.sms.cpu.pc);
        cancelAnimationFrame(this.sms.animationRequest);
        this.update();
    }
}