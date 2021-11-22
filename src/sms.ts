import fs from "fs"
import { Cartridge } from "./cartridge";
import { Cpu } from "./cpu";
import { disassembleRom } from "./disassembler";
import { Memory } from "./memory";

const loadRom = (path: string): Cartridge | null => {
    try {
        const buffer = fs.readFileSync(path);
        return new Cartridge(new Uint8Array(buffer));
      } catch (err) {
        console.error(err)
        return null;
      }
}

const cartridge = loadRom('rom/sonic.sms');
if (cartridge !== null) {
  const initialDisassembly = disassembleRom(cartridge);
  let s = '';
  for (let i = 0; i < initialDisassembly.length; i++) {
    if (!initialDisassembly[i]) continue;
    s += `${i.toString(16).padStart(4, '0')}: ${initialDisassembly[i]}\n`;
  }
  fs.writeFileSync('disassm.txt', s);

  const cpu = new Cpu(new Memory(cartridge));
  let cycles = 10 ** 7;
  let tstates = 0;
  for (let i = 0; i < cycles; i++) {
     tstates += cpu.runNextInstruction(cpu.next8());
  }
  console.log(tstates);
}

