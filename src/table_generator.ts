import { Cpu } from "./cpu";
import { Instruction, decodeBase, decodeEd, decodeCb, decodeIdx, decodeIdxcb, Decoded, BlockFunction } from "./decoder";

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
        tstates: () => 0,
        execute: () => {
            const instruction = edTable[cpu.next8()];
            instruction.execute();
            baseTable[0xed].tstates = instruction.tstates;
        },
        disassembly: () => ''
    }

    baseTable[0xcb] = {
        tstates: () => 0,
        execute: () => {
            const instruction = cbTable[cpu.next8()];
            instruction.execute();
            baseTable[0xcb].tstates = instruction.tstates;
        },
        disassembly: () => ''
    }

    baseTable[0xdd] = {
        tstates: () => 0,
        execute: () => {
            const op = cpu.next8();
            let instruction;
            if (op === 0xcb) instruction = ixcbTable[cpu.bus.read8(cpu.pc + 1)];
            else instruction = ixTable[op];
            instruction.execute();
            baseTable[0xdd].tstates = instruction.tstates;
        },
        disassembly: () => ''
    }

    baseTable[0xfd] = {
        tstates: () => 0,
        execute: () => {
            const op = cpu.next8();
            let instruction;
            if (op === 0xcb) instruction = iycbTable[cpu.bus.read8(cpu.pc + 1)];
            else instruction = iyTable[op];
            instruction.execute();
            baseTable[0xfd].tstates = instruction.tstates;
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

    let tstatesBody = instruction.tstates.toString();
    tstatesBody = tstatesBody.slice(tstatesBody.indexOf('>') + 1);
    let tstatesToAdd = 0;
    if (params) {
        // Add tstates if index instruction which was constructed from base instruction
        const regParams = ['src', 'dst', 'rp', 'rs'];
        regParams.map(p => {
            if (params[p]) {
                if ((params[p] as string).startsWith('i')) tstatesToAdd = 4;
                if ((params[p] as string).startsWith('(i')) tstatesToAdd = 12;
            }
        });
    }
    tstatesBody = `return ${tstatesToAdd} + (${tstatesBody})`;

    let executeBody = instruction.execute.toString();
    executeBody = executeBody.slice(
        executeBody.indexOf('{') + 1, executeBody.lastIndexOf('}')
    );

    executeBody = executeBody.replaceAll(cpuVar, 'this');
    tstatesBody = tstatesBody.replaceAll(cpuVar, 'this');

    // Hardcode parameters
    if (params) {
        const stringParams = ['src', 'dst', 'rp', 'rs', 'idx'];
        stringParams.map(param => {
            if (params[param]) {
                executeBody = executeBody.replaceAll(
                    `${paramsVar}.${param}`, `'${params[param]}'`
                );
                tstatesBody = tstatesBody.replaceAll(
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

        if (params.bli) {
            tstatesBody = tstatesBody.replaceAll(
                `${paramsVar}.bli.fname`,
                `'${(params.bli as BlockFunction).fname}'`
            );
        }
        if (params.cc) {
            tstatesBody = tstatesBody.replaceAll(
                `${paramsVar}.cc`, `(${params.cc})`
            );
        }
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
    instruction.execute = Function(executeBody).bind(cpu);
    instruction.tstates = Function(tstatesBody).bind(cpu);
    return instruction;
}