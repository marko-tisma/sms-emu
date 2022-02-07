import { Cpu } from "./cpu";
import { calculateExtraTstates, decodeBase, decodeCb, Decoded, decodeEd, decodeIdx, decodeIdxcb } from "./decoder";

export const generateInstructionTable = (cpu: Cpu): Function[] => {
    const baseTable = new Array<Function>(256);
    const edTable = new Array<Function>(256);
    const cbTable = new Array<Function>(256);
    const ixTable = new Array<Function>(256);
    const iyTable = new Array<Function>(256);
    const ixcbTable = new Array<Function>(256);
    const iycbTable = new Array<Function>(256);

    for (let op = 0; op <= 0xff; op++) {
        baseTable[op] = rewriteInstruction(cpu, decodeBase(op));
        edTable[op] = rewriteInstruction(cpu, decodeEd(op));
        cbTable[op] = rewriteInstruction(cpu, decodeCb(op));
        ixTable[op] = rewriteInstruction(cpu, decodeIdx(op, 'ix'));
        iyTable[op] = rewriteInstruction(cpu, decodeIdx(op, 'iy'));
        ixcbTable[op] = rewriteInstruction(cpu, decodeIdxcb(op, 'ix'));
        iycbTable[op] = rewriteInstruction(cpu, decodeIdxcb(op, 'iy'));
    }

    baseTable[0xed] = () => {
        edTable[cpu.next8()]();
    }

    baseTable[0xcb] = () => {
        cbTable[cpu.next8()]();
    }

    baseTable[0xdd] = () => {
        const op = cpu.next8();
        if (op === 0xdd || op === 0xfd) {
            cpu.tstates += 4;
            cpu.pc--;
            return;
        }
        let instruction;
        if (op === 0xcb) instruction = ixcbTable[cpu.bus.read8(cpu.pc + 1)];
        else instruction = ixTable[op];
        instruction();
    }

    baseTable[0xfd] = () => {
        const op = cpu.next8();
        if (op === 0xdd || op === 0xfd) {
            cpu.tstates += 4;
            cpu.pc--;
            return;
        }
        let instruction;
        if (op === 0xcb) instruction = iycbTable[cpu.bus.read8(cpu.pc + 1)];
        else instruction = iyTable[op];
        instruction();
    }

    return baseTable;
}

// Rewrites the instruction execute function so that every function
// parameter is hardcoded which improves performance at emulator run time
const rewriteInstruction = (cpu: Cpu, {instructionConstructor, params}: Decoded): Function => {
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
    return Function(executeBody).bind(cpu);
}