import { Cpu } from "./cpu";
import { Instruction, decodeBase, decodeEd, decodeCb, decodeIdx, decodeIdxcb, Decoded, BlockFunction, calculateExtraTstates } from "./decoder";

export const generateInstructionTable = (cpu: Cpu): Instruction[] => {
    const baseTable = new Array<Instruction>(256);
    const edTable = new Array<Instruction>(256);
    const cbTable = new Array<Instruction>(256);
    const ixTable = new Array<Instruction>(256);
    const iyTable = new Array<Instruction>(256);
    const ixcbTable = new Array<Instruction>(256);
    const iycbTable = new Array<Instruction>(256);

    for (let op = 0; op <= 0xff; op++) {
        baseTable[op] = rewriteInstruction(cpu, decodeBase(op));
        edTable[op] = rewriteInstruction(cpu, decodeEd(op));
        cbTable[op] = rewriteInstruction(cpu, decodeCb(op));
        ixTable[op] = rewriteInstruction(cpu, decodeIdx(op, 'ix'));
        iyTable[op] = rewriteInstruction(cpu, decodeIdx(op, 'iy'));
        ixcbTable[op] = rewriteInstruction(cpu, decodeIdxcb(op, 'ix'));
        iycbTable[op] = rewriteInstruction(cpu, decodeIdxcb(op, 'iy'));
    }

    baseTable[0xed] = {
        execute: () => {
            edTable[cpu.next8()].execute();
        },
        disassembly: () => ''
    }

    baseTable[0xcb] = {
        execute: () => {
            cbTable[cpu.next8()].execute();
        },
        disassembly: () => ''
    }

    baseTable[0xdd] = {
        execute: () => {
            const op = cpu.next8();
            let instruction;
            if (op === 0xcb) instruction = ixcbTable[cpu.bus.read8(cpu.pc + 1)];
            else instruction = ixTable[op];
            instruction.execute();
        },
        disassembly: () => ''
    }

    baseTable[0xfd] = {
        execute: () => {
            const op = cpu.next8();
            let instruction;
            if (op === 0xcb) instruction = iycbTable[cpu.bus.read8(cpu.pc + 1)];
            else instruction = iyTable[op];
            instruction.execute();
        },
        disassembly: () => ''
    }

    return baseTable;
}

// Rewrites the instruction execute and tstates functions so that every instruction
// parameter is hardcoded which improves performance at emulator run time
const rewriteInstruction = (cpu: Cpu, {instructionConstructor, params}: Decoded): Instruction => {
    const s = instructionConstructor.toString();
    // Need to determine variable names because esbuild can change them
    let [cpuVar, paramsVar] = s.slice(s.indexOf('(') + 1, s.indexOf(')')).split(',');
    if (paramsVar) paramsVar = paramsVar.trim();

    const instruction = instructionConstructor(cpu, params);

    let executeBody = instruction.execute.toString();
    executeBody = executeBody.slice(
        executeBody.indexOf('{') + 1, executeBody.lastIndexOf('}')
    );
    executeBody = executeBody.replaceAll(cpuVar, 'this');

    // Hardcode parameters
    if (params) {
        const stringParams = ['src', 'dst', 'rp', 'rs', 'idx'];
        stringParams.map(param => {
            if (params[param]) {
                executeBody = executeBody.replaceAll(
                    `${paramsVar}.${param}`, `'${params[param]}'`
                );
            }
        });
        const numberParams = ['im', 'y', 'address'];
        numberParams.map(param => {
            if (params[param] !== undefined) {
                executeBody = executeBody.replaceAll(
                    `${paramsVar}.${param}`, `${params[param]}`
                );
            }
        });
        const functionParams = ['bli', 'rot', 'cc', 'acc'];
        functionParams.map(param => {
            if (params[param]) {
                executeBody = executeBody.replaceAll(
                    `${paramsVar}.${param}`, `(${params[param]})`
                );
            }
        });
    }

    if (executeBody.includes('RegisterName')) {
        executeBody = executeBody.replaceAll('RegisterName', 'this.RegisterName');
    } 

    for (let functionName of Object.keys(cpu.alu)) {
        if (executeBody.includes(`alu.${functionName}(`)) {
            executeBody = executeBody.replaceAll(
                `alu.${functionName}(`, `this.alu.${functionName}(`
            );
        }
        else if (executeBody.includes(`${functionName}(`)) {
            executeBody = executeBody.replaceAll(
                `${functionName}(`, `this.alu.${functionName}(`
            );
        }
    }
    let tstatesToAdd = calculateExtraTstates({instructionConstructor, params});
    executeBody += `;this.tstates += ${tstatesToAdd};`
    instruction.execute = Function(executeBody).bind(cpu);
    return instruction;
}