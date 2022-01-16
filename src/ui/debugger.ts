import { decode, Instruction, registerPairs } from "../decoder";
import { toHex } from "../util";
import { Sms } from "./sms";

export class Debugger {

    breakpoints = new Set();

    constructor(private sms: Sms) {
        document.getElementById('step')!.addEventListener('click', () => {
            this.step();
        });
        document.getElementById('pause')!.addEventListener('click', () => {
            this.pause();
        });
        document.getElementById('start')!.addEventListener('click', () => {
            this.start();
        });
        document.getElementById('mem_show')!.addEventListener('click', () => {
            this.showMemory();
        });
        document.getElementById('mem_clear')!.addEventListener('click', () => {
            this.clearMemory();
        });
    }

    step() {
        const tstates = this.sms.cpu.step();
        this.sms.vdp.run(tstates);
        this.update();
    }

    pause() {
        this.breakpoints.add(this.sms.cpu.pc);
        this.sms.running = false;
        this.update();
        this.showDebug();
    }

    start() {
        if (this.sms.running) return;
        this.breakpoints.delete(this.sms.cpu.pc);
        this.sms.running = true;
        this.hideDebug();
        this.sms.animationRequest = requestAnimationFrame(this.sms.runFrame)
    }

    showMemory() {
        const input = document.getElementById('mem_addr')! as HTMLInputElement;
        const address = parseInt(input.value, 16);
        if (!isNaN(address)) {
            const bytes = this.sms.cpu.bus.readn(address, 16);
            const text = `${toHex(address, 4)}: ${bytes.map(b => `$${toHex(b, 2)}`).join(', ')}`;
            const list = document.getElementById('mem')! as HTMLUListElement;
            this.addLi(list, text);
        }
    }

    clearMemory() {
        const list = document.getElementById('mem')! as HTMLUListElement;
        list.innerHTML = '';
    }

    update() {
        this.updateDisassembly(this.decodeNextInstructions(1000));
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
            li.addEventListener('click', () => {
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

    updateState() {
        const cpu = this.sms.cpu;
        const cpuList = document.getElementById('cpu')! as HTMLUListElement;
        cpuList.innerHTML = '';

        let text = registerPairs.map(rp => `${rp}: $${toHex(cpu[rp], 4)}`).join(', ');
        this.addLi(cpuList, text);
        this.addLi(cpuList, `(hl): $${toHex(cpu['(hl)'], 2)}, (hl + 1): $${toHex(cpu.bus.read8(cpu.hl + 1), 2)}`);

        text = Object.keys(cpu.flags).map(f => `${f}: ${cpu.flags[f]}`).join(', ');
        this.addLi(cpuList, text);
        this.addLi(cpuList, `imode: ${cpu.interruptMode}`);

        const vdpList = document.getElementById('vdp')! as HTMLUListElement;
        const vdp = this.sms.cpu.bus.vdp;
        vdpList.innerHTML = '';
        this.addLi(vdpList, `address register: $${toHex(vdp.addressRegister, 4)}`);
        this.addLi(vdpList, `code register: $${toHex(vdp.codeRegister, 4)}`);
        this.addLi(vdpList, `vdp registers: ${vdp.registers.map((r, i) => i + ': $' + toHex(r, 2)).join(', ')}`);
        this.addLi(vdpList, `vCounter: ${vdp.vCounter}, hCounter: ${vdp.hCounter}`);
    }

    addLi(list: HTMLUListElement, text: string) {
        const li = document.createElement('li');
        li.appendChild(document.createTextNode(text));
        list.appendChild(li);
    }

    decodeNextInstructions(count: number): Instruction[] {
        const cpu = this.sms.cpu;
        const startTstates = cpu.tstates;
        let startPc = cpu.pc;
        const instructions = [];

        for (let i = 0; i < count; i++) {
            const currPc = cpu.pc;
            let decoded = decode(cpu.next8(), cpu);
            const instruction = decoded.instructionConstructor(cpu, decoded.params);
            let disassembly = instruction.disassembly();
            if (disassembly.includes('NN')) {
                disassembly = disassembly.replace('NN', '$' + toHex(cpu.next16(), 4));
            }
            if (disassembly.includes('N')) {
                disassembly = disassembly.replace('N', '$' + toHex(cpu.next8(), 2));
            }
            if (disassembly.includes('D')) {
                disassembly = disassembly.replace('D', '$' + toHex(cpu.next8Signed(), 2));
            }
            instruction.disassembly = () => disassembly;
            instruction.address = currPc;
            instructions.push(instruction);
        }

        cpu.pc = startPc;
        cpu.tstates = startTstates;
        return instructions;
    }



}