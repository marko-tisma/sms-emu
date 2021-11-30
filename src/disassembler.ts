import { Cartridge } from "./cartridge"
import { Cpu } from "./cpu"
import { decode } from "./decoder"
import { Memory } from "./memory"

export const disassembleRom = (cartridge: Cartridge): string[] => {
    const cpu = new Cpu(new Memory(cartridge));

    const disassembly = new Array<string>(cartridge.rom.length);
    const visited = new Set();

    const rstAddresses = [0, 0x8, 0x10, 0x18, 0x20, 0x28, 0x30, 0x38];
    const interruptAddreses = [0x38, 0x66];
    const entrypoints = [...rstAddresses, ...interruptAddreses];

    const controlInstructions = ['jp', 'jr', 'call', 'ret'];

    for (const entrypoint of entrypoints) {
        cpu.pc = entrypoint;
        while (true) {
            const pc = cpu.pc;
            if (visited.has(pc)) {
                break;
            }
            visited.add(pc);
            const op = cpu.next8();
            const instruction = decode(op, cpu);
            disassembly[pc] = instruction.disassembly;
            if (controlInstructions.some(i => instruction.disassembly.startsWith(i))) {
                if (instruction.disassembly.includes(', ') || instruction.disassembly.startsWith('call')) {
                    // Conditional jump/call, continue on both execution paths
                    entrypoints.push(cpu.pc);
                }
                instruction.execute();
            }
        }
    }
    return disassembly;
}