import { Cartridge } from "./cartridge"
import { Cpu } from "./cpu"
import { decode } from "./decoder";
import { Instruction, toSignedByte } from "./instructions";
import { Memory } from "./memory";

export const disassemble = (instruction: Instruction, cpu: Cpu): string => {
    const params = instruction.params;
    let mnemonic = instruction.mnemonic;
    if (mnemonic.includes('NN')) mnemonic = mnemonic.replace('NN', '$' + cpu.next16().toString(16));
    else if (mnemonic.includes('N')) mnemonic = mnemonic.replace('N', '$' + cpu.next8().toString(16));
    else if (mnemonic.includes('D')) mnemonic = mnemonic.replace('D', '$' + (toSignedByte(cpu.next8()) + cpu.pc).toString(16));
    if (params.length > 0) {
        mnemonic = mnemonic.replace('rp0', params[0]);
        mnemonic = mnemonic.replace('rp1', params[1]);
        mnemonic = mnemonic.replace('r0', params[0] == '_hl_' ? '(hl)' : params[0]);
        mnemonic = mnemonic.replace('r1', params[1] == '_hl_' ? '(hl)' : params[1]);
        mnemonic = mnemonic.replace('r2', params[2]);
        mnemonic = mnemonic.replace('Y', params[0]);
        mnemonic = mnemonic.replace('IDX', params[1]);
        if (params[0].name) {
            mnemonic = mnemonic.replace('BLI', params[0].name);
            mnemonic = mnemonic.replace('CC', params[0].name);
            mnemonic = mnemonic.replace('ALU', params[0].name.substring(0, params[0].name.length - 3));
            mnemonic = mnemonic.replace('ROT', params[0].name);
        }
    }
    return mnemonic;
}

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
            const op = cpu.next8();
            const instruction = decode(op, cpu);
            disassembly[pc] = disassemble(instruction, cpu);
            visited.add(pc);
            if (controlInstructions.some(i => instruction.mnemonic.startsWith(i))) {
                const op = cpu.memory.read8(pc); 
                if (op === 0xed || op === 0xdd || op === 0xfd) {
                    cpu.pc = pc + 2;
                }
                else {
                    cpu.pc = pc + 1;
                } 
                if (instruction.mnemonic.includes('CC')) {
                    entrypoints.push(cpu.pc);
                    instruction.execute(cpu, () => true);
                    continue;
                }
                if (instruction.mnemonic.startsWith('call')) {
                    entrypoints.push(cpu.pc);
                    instruction.execute(cpu);
                    continue;
                }
                instruction.execute(cpu, ...instruction.params);
            }
        }
    }
    return disassembly;
}