import { decode, Instruction, registerPairs } from "../decoder";
import { toHex } from "../util";
import { Sms } from "./sms";

type State = { [key: string]: number | number[] | boolean };
export class Debugger {

    breakpoints = new Set<number>();
    private disassembly: Instruction[] = [];
    private state: State;

    constructor(private sms: Sms) {
        this.updateDisassembly(1000);
        this.state = { ...this.getCpuState(), ...this.getVdpState() };
        this.hideDebugUi();
    }

    showDebugUi(): void {
        document.getElementById('disassembly')!.style.display = 'inline';
        document.getElementById('state')!.style.display = 'inline';
        document.getElementById('debug_controls')!.style.display = 'flex';
    }

    hideDebugUi(): void {
        document.getElementById('disassembly')!.style.display = 'none';
        document.getElementById('state')!.style.display = 'none';
        document.getElementById('debug_controls')!.style.display = 'none';
    }

    startDebug(): void {
        this.sms.running = false;
        this.showDebugUi();
        this.update();
    }

    step(): void {
        if (this.sms.running) return;
        const tstates = this.sms.cpu.step();
        this.sms.cpu.bus.vdp.update(tstates);
        this.sms.cpu.bus.sound.update(tstates);
        this.update();
    }

    continue(): void {
        if (this.sms.running) return;
        this.step();
        this.sms.run();
    }

    showMemory(event: Event): void {
        const input = (<HTMLInputElement>event.target).value;
        const address = parseInt(input, 16);
        if (!isNaN(address)) {
            const value = toHex(this.sms.cpu.bus.read8(address));
            const text = `byte at $${toHex(address, 4)}: $${value}`;
            document.querySelector('#mem_value')!.innerHTML = text;
        }
    }

    update(): void {
        this.updateState();
        this.updateDisassembly(10);
    }

    private updateDisassembly(instructionCount: number): void {
        const updated = this.decodeNextInstructions(instructionCount);
        const pc = this.sms.cpu.pc;
        let insertIndex = this.disassembly.findIndex(x => x.address! >= pc);
        if (insertIndex === -1) insertIndex = this.disassembly.length;
        this.disassembly.splice(insertIndex, instructionCount, ...updated);

        const list = document.querySelector('#disassembly')!;
        list.innerHTML = '';
        let currentInstructionLi;
        for (const instruction of this.disassembly) {
            const address = instruction.address!;
            const li = document.createElement('li');
            li.setAttribute('id', address.toString(16));

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

            if (this.breakpoints.has(address)) {
                li.classList.add('breakpoint');
            }
            if (address === pc) {
                li.classList.add('current');
                currentInstructionLi = li;
            }
            const text = `$${toHex(address, 4)}: ${instruction.disassembly()}`;
            li.appendChild(document.createTextNode(text));
            list.appendChild(li);
        }
        if (!this.isElementInViewport(currentInstructionLi as HTMLElement)) {
            currentInstructionLi?.scrollIntoView(true);
        }
    }

    private decodeNextInstructions(count: number): Instruction[] {
        const cpu = this.sms.cpu;
        const startTstates = cpu.tstates;
        let startPc = cpu.pc;

        const instructions = [];
        for (let i = 0; i < count; i++) {
            const currentPc = cpu.pc;
            let decoded = decode(cpu.next8(), cpu);
            const instruction = decoded.instructionConstructor(cpu, decoded.params);
            let disassembly = instruction.disassembly();
            if (disassembly.includes('NN')) {
                const nn = cpu.next16();
                disassembly = disassembly.replace('NN', `$${toHex(nn, 4)}`);
            }
            if (disassembly.includes('N')) {
                const n = cpu.next8();
                disassembly = disassembly.replace('N', `$${toHex(n, 2)}`);
            }
            if (disassembly.includes('D')) {
                const d = cpu.next8Signed();
                if (decoded.params?.idx && Object.keys(decoded.params).length > 1) {
                    // Index CB instructions
                    cpu.pc++;
                    disassembly = disassembly.replace('D', `$${toHex(d, 2)}`);
                }
                else {
                    disassembly = disassembly.replace('D', `$${toHex(cpu.pc + d, 2)}`);
                }
            }
            instruction.disassembly = () => disassembly;
            instruction.address = currentPc;
            instructions.push(instruction);
        }

        cpu.pc = startPc;
        cpu.tstates = startTstates;
        return instructions;
    }

    private isElementInViewport(el: HTMLElement): boolean {
        const rect = el.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) && /* or $(window).height() */
            rect.right <= (window.innerWidth || document.documentElement.clientWidth) /* or $(window).width() */
        );
    }

    private updateState(): void {
        const list = <HTMLUListElement>document.querySelector('#state');
        list.innerHTML = '';
        const newCpuState = this.getCpuState();
        this.updateStateList(list, newCpuState);
        const newVdpState = this.getVdpState();
        this.updateStateList(list, newVdpState);
        this.state = { ...newCpuState, ...newVdpState };
    }

    private updateStateList(stateList: HTMLUListElement, newState: State): void {
        for (let [key, value] of Object.entries(newState)) {
            const li = document.createElement('li');
            let text;
            if (typeof value !== 'number') text = `${key}: ${value}`;
            else text = `${key}: $${toHex(<number>value, 4)}`;
            li.appendChild(document.createTextNode(text));

            if (this.state[key] !== value) li.classList.add('changed');
            else li.classList.remove('changed');
            stateList.appendChild(li);
        }
    }

    private getCpuState(): State {
        const cpu = this.sms.cpu;
        const state: State = {};
        for (const rp of registerPairs) {
            state[rp] = cpu[rp];
        }
        for (const [flag, value] of Object.entries(cpu.flags)) {
            state[flag] = value;
        }
        state['frame pages'] = cpu.bus.framePages;
        state['iff1'] = cpu.iff1;
        state['iff2'] = cpu.iff2;
        state['halted'] = cpu.halted;
        return state;
    }

    private getVdpState(): State {
        const vdp = this.sms.cpu.bus.vdp;
        const state: State = {};
        state['address reg'] = vdp.addressRegister;
        state['code reg'] = vdp.codeRegister;
        for (const [i, value] of vdp.registers.entries()) {
            state[i] = value;
        }
        return state;
    }

}