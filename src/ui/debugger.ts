import { decode, Instruction, registerPairs } from "../decoder";
import { toHex } from "../util";
import { Sms } from "./sms";

export class Debugger {

    breakpoints = new Set<number>();
    disassembly: Instruction[] = [];

    constructor(private sms: Sms) {
        this.initListeners();
    }

    initListeners() {
        document.getElementById('step')!.addEventListener('click', () => {
            this.step();
        });
        document.getElementById('pause')!.addEventListener('click', () => {
            this.pause();
        });
        document.getElementById('start')!.addEventListener('click', () => {
            this.start();
        });
        document.getElementById('continue')!.addEventListener('click', () => {
            this.continue();
        });
        document.getElementById('mem_show')!.addEventListener('click', () => {
            this.showMemory();
        });
        document.getElementById('mem_clear')!.addEventListener('click', () => {
            this.clearMemory();
        });
    }

    checkBreakpoint(pc: number) {
        if (this.breakpoints.has(pc)) {
            this.update();
            this.showDebug();
            this.sms.running = false;
            return true;
        }
        return false;
    }

    showDebug() {
        document.querySelector('#disassembly')!.removeAttribute('style');
        document.querySelector('.state')!.removeAttribute('style');
    }

    hideDebug() {
        document.querySelector('#disassembly')!.setAttribute('style', 'display: none');
        document.querySelector('.state')!.setAttribute('style', 'display: none');
    }

    start() {
        if (this.sms.running) return;
        this.hideDebug();
        this.breakpoints.delete(this.sms.cpu.pc);
        this.sms.running = true;
        requestAnimationFrame(this.sms.runFrame)
    }

    step() {
        const tstates = this.sms.cpu.step();
        this.sms.cpu.bus.vdp.update(tstates);
        this.update();
    }

    pause() {
        this.breakpoints.add(this.sms.cpu.pc);
        this.sms.running = false;
        this.showDebug();
        this.update();
    }

    continue() {
        if (this.sms.running) return;
        this.hideDebug();
        this.step();
        this.sms.running = true;
        requestAnimationFrame(this.sms.runFrame)
    }

    showMemory() {
        const input = document.getElementById('mem_addr')! as HTMLInputElement;
        const address = parseInt(input.value, 16);
        if (!isNaN(address)) {
            const bytes = this.sms.cpu.bus.readn(address, 16);
            const text = `${toHex(address, 4)}: ${bytes.map(b => `$${toHex(b, 2)}`).join(', ')}`;
            const list = document.getElementById('mem')! as HTMLUListElement;
            this.addTextLi(list, text);
        }
    }

    clearMemory() {
        const list = document.getElementById('mem')! as HTMLUListElement;
        list.innerHTML = '';
    }

    update() {
        this.updateState();
        this.updateDisassembly(1000);
    }

    updateDisassembly(updateCount: number) {
        const updated = this.decodeNextInstructions(updateCount);
        this.disassembly = [...this.disassembly, ...updated];
        this.disassembly.sort((a, b) => a.address! - b.address!);

        const list = document.querySelector('#disassembly')!;
        list.innerHTML = '';
        let currentLi;
        for (const instruction of this.disassembly) {
            const address = instruction.address!;
            const li = document.createElement('li');
            if (this.breakpoints.has(address)) {
                li.classList.add('breakpoint');
            }

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
            if (address === pc) {
                li.classList.add('current');
                currentLi = li;
            }
        }
        currentLi?.scrollIntoView(true);
    }

    updateState() {
        const cpu = this.sms.cpu;
        const cpuList = document.getElementById('cpu')! as HTMLUListElement;
        cpuList.innerHTML = '';

        let text = registerPairs.map(rp => `${rp}: $${toHex(cpu[rp], 4)}`).join(', ');
        this.addTextLi(cpuList, text);
        this.addTextLi(cpuList, `(hl): $${toHex(cpu['(hl)'], 2)}`);

        text = Object.keys(cpu.flags).map(f => `${f}: ${cpu.flags[f]}`).join(', ');
        this.addTextLi(cpuList, text);
        this.addTextLi(cpuList, `imode: ${cpu.interruptMode}, frame pages: ${cpu.bus.framePages}, iff1: ${cpu.iff1}, halted: ${cpu.halted}`);

        const vdpList = document.getElementById('vdp')! as HTMLUListElement;
        const vdp = this.sms.cpu.bus.vdp;
        vdpList.innerHTML = '';
        text = `address register: $${toHex(vdp.addressRegister, 4)}` +
            `, code register: $${toHex(vdp.codeRegister, 4)}` +
            `, vdp registers: ${vdp.registers.map((r, i) => i + ': $' + toHex(r, 2)).join(', ')}`;
        this.addTextLi(vdpList, text);
        this.addTextLi(vdpList, `vCounter: ${vdp.vCounter}, hCounter: ${vdp.hCounter}, firstByte: ${vdp.firstControlByte}`);
        text = `background table address: ${toHex(vdp.tilesTableAddress())}, frame interrupt pending: ${vdp.frameInterruptPending}`;
        this.addTextLi(vdpList, text);
    }

    addTextLi(list: HTMLUListElement, text: string) {
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