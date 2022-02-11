const p$1 = function polyfill() {
    const relList = document.createElement('link').relList;
    if (relList && relList.supports && relList.supports('modulepreload')) {
        return;
    }
    for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
        processPreload(link);
    }
    new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type !== 'childList') {
                continue;
            }
            for (const node of mutation.addedNodes) {
                if (node.tagName === 'LINK' && node.rel === 'modulepreload')
                    processPreload(node);
            }
        }
    }).observe(document, { childList: true, subtree: true });
    function getFetchOpts(script) {
        const fetchOpts = {};
        if (script.integrity)
            fetchOpts.integrity = script.integrity;
        if (script.referrerpolicy)
            fetchOpts.referrerPolicy = script.referrerpolicy;
        if (script.crossorigin === 'use-credentials')
            fetchOpts.credentials = 'include';
        else if (script.crossorigin === 'anonymous')
            fetchOpts.credentials = 'omit';
        else
            fetchOpts.credentials = 'same-origin';
        return fetchOpts;
    }
    function processPreload(link) {
        if (link.ep)
            // ep marker = processed
            return;
        link.ep = true;
        // prepopulate the load record
        const fetchOpts = getFetchOpts(link);
        fetch(link.href, fetchOpts);
    }
};true&&p$1();

var style = '';

class Bus {
  constructor(cartridge, vdp, sound) {
    this.cartridge = cartridge;
    this.vdp = vdp;
    this.sound = sound;
  }
  static MEMORY_SIZE = 2 ** 16;
  static PAGE_SIZE = 2 ** 14;
  static RAM_SIZE = 2 ** 13;
  static FRAME_0_OFFSET = 1024;
  static FRAME_1_OFFSET = 16384;
  static FRAME_2_OFFSET = 32768;
  static RAM_OFFSET = 49152;
  static RAM_MIRROR_OFFSET = 57344;
  static FRAME_2_CB_OFFSET = 65532;
  static FRAME_0_FCR_OFFSET = 65533;
  static FRAME_1_FCR_OFFSET = 65534;
  static FRAME_2_FCR_OFFSET = 65535;
  framePages = [0, 1, 2];
  ramInFrame2 = false;
  frame2RamPage = 0;
  ram = new Uint8Array(Bus.RAM_SIZE);
  ports = new Uint8Array(256);
  ioControl = 255;
  memoryControl = 171;
  read8(address) {
    if (address < Bus.FRAME_0_OFFSET) {
      return this.cartridge.rom[address];
    } else if (address < Bus.RAM_OFFSET) {
      const frame = Math.floor(address / Bus.PAGE_SIZE);
      address -= frame * Bus.PAGE_SIZE;
      if (frame === 2 && this.ramInFrame2) {
        address += this.frame2RamPage * Bus.PAGE_SIZE;
        return this.cartridge.ram[address];
      }
      let page = this.framePages[frame];
      if (page >= this.cartridge.pages) {
        page &= this.cartridge.pages - 1;
      }
      return this.cartridge.rom[page * Bus.PAGE_SIZE + address];
    } else if (address < Bus.RAM_MIRROR_OFFSET) {
      return this.ram[address - Bus.RAM_OFFSET];
    } else if (address < Bus.FRAME_2_CB_OFFSET) {
      return this.ram[address - Bus.RAM_MIRROR_OFFSET];
    } else if (address === Bus.FRAME_2_CB_OFFSET) {
      return +this.ramInFrame2 << 3 | this.frame2RamPage << 2;
    } else if (address < Bus.MEMORY_SIZE) {
      return this.framePages[address - Bus.FRAME_0_FCR_OFFSET];
    }
    return 0;
  }
  write8(address, value) {
    if (address < Bus.RAM_OFFSET) {
      if (this.ramInFrame2 && Bus.FRAME_2_OFFSET <= address) {
        address -= Bus.FRAME_2_OFFSET;
        address += this.frame2RamPage * Bus.PAGE_SIZE;
        this.cartridge.ram[address] = value;
      }
    } else if (address < Bus.RAM_MIRROR_OFFSET) {
      this.ram[address - Bus.RAM_OFFSET] = value;
    } else if (address < Bus.FRAME_2_CB_OFFSET) {
      this.ram[address - Bus.RAM_MIRROR_OFFSET] = value;
    } else if (address === Bus.FRAME_2_CB_OFFSET) {
      this.ramInFrame2 = !!(value & 8);
      this.frame2RamPage = (value & 4) >>> 2;
      this.ram[8188] = value;
    } else if (address < Bus.MEMORY_SIZE) {
      this.framePages[address - Bus.FRAME_0_FCR_OFFSET] = value & 255;
      this.ram[address - Bus.FRAME_0_FCR_OFFSET + 8189] = value;
    }
  }
  read16(address) {
    return (this.read8(address + 1) << 8) + this.read8(address);
  }
  write16(address, value) {
    this.write8(address, value & 255);
    this.write8(address + 1, value >>> 8);
  }
  readn(address, count) {
    const values = [];
    for (let i = 0; i < count; i++) {
      values.push(this.read8(address + i));
    }
    return values;
  }
  in(port) {
    switch (port & 193) {
      case 0:
      case 1:
        return 255;
      case 64:
        return this.vdp.getVCounter();
      case 65:
        return this.vdp.getHCounter();
      case 128:
        return this.vdp.readDataPort();
      case 129:
        return this.vdp.readControlPort();
      case 192:
        return this.ports[220];
      case 193:
        return this.ioControl & 128 | (this.ioControl & 32) << 1 | this.ports[221] & 63;
      default:
        return 0;
    }
  }
  out(port, value) {
    switch (port & 193) {
      case 0:
        this.memoryControl = value;
        break;
      case 1:
        const th = this.ioControl & 160;
        this.ioControl = value;
        if (th === 0 && this.ioControl & 160) {
          this.vdp.hCounterBuffer = this.vdp.hCounter;
        }
        break;
      case 64:
      case 65:
        this.sound.write(value);
        break;
      case 128:
        this.vdp.writeDataPort(value);
        break;
      case 129:
        this.vdp.writeControlPort(value);
        break;
      default:
        this.ports[port] = value;
        break;
    }
  }
}

class Cartridge {
  ram = new Uint8Array(2 ** 14 * 2);
  rom;
  pages;
  constructor(rom) {
    this.rom = rom;
    if (rom.length % 16384 === 512) {
      console.log("rom header trimmed");
      this.rom = rom.slice(512);
    }
    this.pages = rom.length / 2 ** 14;
  }
}

const parity = (value) => {
  let parity2 = 0;
  while (value) {
    parity2 ^= value & 1;
    value >>>= 1;
  }
  return parity2 === 0;
};
const io_in = (cpu, port) => {
  const result = cpu.bus.in(port);
  cpu.flags.s = !!(result & 128);
  cpu.flags.z = !(result & 255);
  cpu.flags.h = false;
  cpu.flags.pv = parity(result);
  cpu.flags.n = false;
  return result;
};
const bit_y = (cpu, value, y) => {
  const mask = 1 << y;
  cpu.flags.z = !(mask & value);
  cpu.flags.s = y === 7 && !cpu.flags.z;
  cpu.flags.pv = cpu.flags.z;
  cpu.flags.h = true;
  cpu.flags.n = false;
};
const add16 = (cpu, x, y) => {
  const result = x + y;
  cpu.flags.h = !!((x & 4095) + (y & 4095) & 4096);
  cpu.flags.n = false;
  cpu.flags.c = !!(result & 65536);
  return result & 65535;
};
const adc16 = (cpu, x, y) => {
  const c = +cpu.flags.c;
  const result = x + y + c;
  cpu.flags.s = !!(result & 32768);
  cpu.flags.z = !(result & 65535);
  cpu.flags.h = !!((x & 4095) + (y & 4095) + c & 4096);
  if ((x & 32768) !== (y & 32768))
    cpu.flags.pv = false;
  else
    cpu.flags.pv = (x & 32768) !== (result & 32768);
  cpu.flags.n = false;
  cpu.flags.c = !!(result & 65536);
  return result & 65535;
};
const sbc16 = (cpu, x, y) => {
  const c = +cpu.flags.c;
  const result = x - y - c;
  cpu.flags.s = !!(result & 32768);
  cpu.flags.z = !(result & 65535);
  cpu.flags.h = !!((x & 4095) - (y & 4095) - c & 4096);
  if ((x & 32768) === (y & 32768))
    cpu.flags.pv = false;
  else
    cpu.flags.pv = (x & 32768) !== (result & 32768);
  cpu.flags.n = true;
  cpu.flags.c = !!(result & 65536);
  return result & 65535;
};
const inc8 = (cpu, value) => {
  const result = value + 1;
  cpu.flags.s = !!(result & 128);
  cpu.flags.z = !(result & 255);
  cpu.flags.h = !!((value & 15) + 1 & 16);
  cpu.flags.pv = value === 127;
  cpu.flags.n = false;
  return result & 255;
};
const dec8 = (cpu, value) => {
  const result = value - 1;
  cpu.flags.s = !!(result & 128);
  cpu.flags.z = !(result & 255);
  cpu.flags.h = !!((value & 15) - 1 & 16);
  cpu.flags.pv = value === 128;
  cpu.flags.n = true;
  return result & 255;
};
const rlc = (cpu, value) => {
  const msb = value >>> 7;
  const result = (value << 1 | msb) & 255;
  cpu.flags.s = !!(result & 128);
  cpu.flags.z = !result;
  cpu.flags.h = false;
  cpu.flags.pv = parity(result);
  cpu.flags.n = false;
  cpu.flags.c = !!msb;
  return result;
};
rlc.fname = "rlc";
const rrc = (cpu, value) => {
  const lsb = value & 1;
  const result = value >>> 1 | lsb << 7;
  cpu.flags.s = !!(result & 128);
  cpu.flags.z = !result;
  cpu.flags.h = false;
  cpu.flags.pv = parity(result);
  cpu.flags.n = false;
  cpu.flags.c = !!lsb;
  return result;
};
rrc.fname = "rrc";
const rl = (cpu, value) => {
  const msb = value >>> 7;
  const result = (value << 1 | +cpu.flags.c) & 255;
  cpu.flags.s = !!(result & 128);
  cpu.flags.z = !result;
  cpu.flags.h = false;
  cpu.flags.pv = parity(result);
  cpu.flags.n = false;
  cpu.flags.c = !!msb;
  return result;
};
rl.fname = "rl";
const rr = (cpu, value) => {
  const lsb = value & 1;
  const result = +cpu.flags.c << 7 | value >>> 1;
  cpu.flags.s = !!(result & 128);
  cpu.flags.z = !result;
  cpu.flags.h = false;
  cpu.flags.pv = parity(result);
  cpu.flags.n = false;
  cpu.flags.c = !!lsb;
  return result;
};
rr.fname = "rr";
const sla = (cpu, value) => {
  const msb = value >>> 7;
  const result = value << 1 & 255;
  cpu.flags.s = !!(result & 128);
  cpu.flags.z = !result;
  cpu.flags.h = false;
  cpu.flags.pv = parity(result);
  cpu.flags.n = false;
  cpu.flags.c = !!msb;
  return result;
};
sla.fname = "sla";
const sra = (cpu, value) => {
  const lsb = value & 1;
  const result = value & 128 | value >> 1;
  cpu.flags.s = !!(result & 128);
  cpu.flags.z = !result;
  cpu.flags.pv = parity(result);
  cpu.flags.h = false;
  cpu.flags.n = false;
  cpu.flags.c = !!lsb;
  return result;
};
sra.fname = "sra";
const sll = (cpu, value) => {
  const msb = value >>> 7;
  const result = (value << 1 | 1) & 255;
  cpu.flags.s = !!(result & 128);
  cpu.flags.z = !result;
  cpu.flags.h = false;
  cpu.flags.pv = parity(result);
  cpu.flags.n = false;
  cpu.flags.c = !!msb;
  return result;
};
sll.fname = "sll";
const srl = (cpu, value) => {
  const lsb = value & 1;
  const result = value >>> 1;
  cpu.flags.s = !!(result & 128);
  cpu.flags.z = !result;
  cpu.flags.h = false;
  cpu.flags.pv = parity(result);
  cpu.flags.n = false;
  cpu.flags.c = !!lsb;
  return result;
};
srl.fname = "srl";
const ldi = (cpu) => {
  cpu.bus.write8(cpu.de, cpu.bus.read8(cpu.hl));
  cpu.de++;
  cpu.hl++;
  cpu.bc--;
  cpu.flags.h = false;
  cpu.flags.pv = cpu.bc !== 0;
  cpu.flags.n = false;
};
ldi.fname = "ldi";
const ldir = (cpu) => {
  ldi(cpu);
  if (cpu.bc > 0) {
    cpu.pc -= 2;
    return false;
  }
  return true;
};
ldir.fname = "ldir";
const ldd = (cpu) => {
  cpu.bus.write8(cpu.de, cpu.bus.read8(cpu.hl));
  cpu.de--;
  cpu.hl--;
  cpu.bc--;
  cpu.flags.h = false;
  cpu.flags.pv = cpu.bc !== 0;
  cpu.flags.n = false;
};
ldd.fname = "ldd";
const lddr = (cpu) => {
  ldd(cpu);
  if (cpu.bc > 0) {
    cpu.pc -= 2;
    return false;
  }
  return true;
};
lddr.fname = "lddr";
const cpi = (cpu) => {
  const tmp = cpu.flags.c;
  cpAcc(cpu, cpu.bus.read8(cpu.hl));
  cpu.hl++;
  cpu.bc--;
  cpu.flags.pv = cpu.bc !== 0;
  cpu.flags.c = tmp;
};
cpi.fname = "cpi";
const cpir = (cpu) => {
  cpi(cpu);
  if (cpu.bc === 0 || cpu.flags.z) {
    return true;
  }
  cpu.pc -= 2;
  return false;
};
cpir.fname = "cpir";
const cpd = (cpu) => {
  const tmp = cpu.flags.c;
  cpAcc(cpu, cpu.bus.read8(cpu.hl));
  cpu.hl--;
  cpu.bc--;
  cpu.flags.pv = cpu.bc !== 0;
  cpu.flags.c = tmp;
};
cpd.fname = "cpd";
const cpdr = (cpu) => {
  cpd(cpu);
  if (cpu.bc === 0 || cpu.flags.z) {
    return true;
  }
  cpu.pc -= 2;
  return false;
};
cpdr.fname = "cpdr";
const ini = (cpu) => {
  cpu.bus.write8(cpu.hl, cpu.bus.in(cpu.c));
  cpu.hl++;
  cpu.b--;
  cpu.flags.z = cpu.b === 0;
  cpu.flags.n = true;
};
ini.fname = "ini";
const inir = (cpu) => {
  ini(cpu);
  cpu.flags.z = true;
  if (cpu.b === 0) {
    return true;
  }
  cpu.pc -= 2;
  return false;
};
inir.fname = "inir";
const ind = (cpu) => {
  cpu.bus.write8(cpu.hl, cpu.bus.in(cpu.c));
  cpu.hl--;
  cpu.b--;
  cpu.flags.s = !!(cpu.b & 128);
  cpu.flags.z = cpu.b === 0;
  cpu.flags.n = true;
};
ind.fname = "ind";
const indr = (cpu) => {
  ind(cpu);
  cpu.flags.z = true;
  if (cpu.b === 0) {
    return true;
  }
  cpu.pc -= 2;
  return false;
};
indr.fname = "indr";
const outi = (cpu) => {
  cpu.bus.out(cpu.c, cpu.bus.read8(cpu.hl));
  cpu.hl++;
  cpu.b--;
  cpu.flags.z = cpu.b === 0;
  cpu.flags.n = true;
};
outi.fname = "outi";
const otir = (cpu) => {
  outi(cpu);
  if (cpu.b === 0) {
    return true;
  }
  cpu.flags.pv = false;
  cpu.flags.n = !!(cpu.bus.read8(cpu.hl) & 128);
  cpu.pc -= 2;
  return false;
};
otir.fname = "otir";
const outd = (cpu) => {
  cpu.bus.out(cpu.c, cpu.bus.read8(cpu.hl));
  cpu.hl--;
  cpu.b--;
  cpu.flags.s = !!(cpu.b & 128);
  cpu.flags.z = cpu.b === 0;
  cpu.flags.n = true;
};
outd.fname = "outd";
const otdr = (cpu) => {
  outd(cpu);
  if (cpu.b === 0) {
    return true;
  }
  cpu.flags.z = true;
  cpu.pc -= 2;
  return false;
};
otdr.fname = "otdr";
const addAcc = (cpu, value) => {
  let result = cpu.a + value;
  cpu.flags.s = !!(result & 128);
  cpu.flags.z = !(result & 255);
  cpu.flags.h = !!((cpu.a & 15) + (value & 15) & 16);
  if ((cpu.a & 128) !== (value & 128))
    cpu.flags.pv = false;
  else
    cpu.flags.pv = (result & 128) !== (cpu.a & 128);
  cpu.flags.n = false;
  cpu.flags.c = !!(result & 256);
  cpu.a = result;
};
addAcc.fname = "add";
const adcAcc = (cpu, value) => {
  const c = +cpu.flags.c;
  let result = cpu.a + value + c;
  cpu.flags.s = !!(result & 128);
  cpu.flags.z = !(result & 255);
  cpu.flags.h = !!((cpu.a & 15) + (value & 15) + c & 16);
  if ((cpu.a & 128) !== (value & 128))
    cpu.flags.pv = false;
  else
    cpu.flags.pv = (result & 128) !== (cpu.a & 128);
  cpu.flags.n = false;
  cpu.flags.c = !!(result & 256);
  cpu.a = result;
};
adcAcc.fname = "adc";
const subAcc = (cpu, value) => {
  let result = cpu.a - value;
  cpu.flags.s = !!(result & 128);
  cpu.flags.z = !(result & 255);
  cpu.flags.h = !!((cpu.a & 15) - (value & 15) & 16);
  if ((cpu.a & 128) === (value & 128))
    cpu.flags.pv = false;
  else
    cpu.flags.pv = (result & 128) !== (cpu.a & 128);
  cpu.flags.n = true;
  cpu.flags.c = !!(result & 256);
  cpu.a = result;
};
subAcc.fname = "sub";
const sbcAcc = (cpu, value) => {
  const c = +cpu.flags.c;
  let result = cpu.a - value - c;
  cpu.flags.s = !!(result & 128);
  cpu.flags.z = !(result & 255);
  cpu.flags.h = !!((cpu.a & 15) - (value & 15) - c & 16);
  if ((cpu.a & 128) === (value & 128))
    cpu.flags.pv = false;
  else
    cpu.flags.pv = (result & 128) !== (cpu.a & 128);
  cpu.flags.n = true;
  cpu.flags.c = !!(result & 256);
  cpu.a = result;
};
sbcAcc.fname = "sbc";
const andAcc = (cpu, value) => {
  const result = cpu.a & value;
  cpu.flags.s = !!(result & 128);
  cpu.flags.z = !(result & 255);
  cpu.flags.h = true;
  cpu.flags.pv = parity(result);
  cpu.flags.n = false;
  cpu.flags.c = false;
  cpu.a = result;
};
andAcc.fname = "and";
const xorAcc = (cpu, value) => {
  const result = cpu.a ^ value;
  cpu.flags.s = !!(result & 128);
  cpu.flags.z = !(result & 255);
  cpu.flags.h = false;
  cpu.flags.pv = parity(result);
  cpu.flags.n = false;
  cpu.flags.c = false;
  cpu.a = result;
};
xorAcc.fname = "xor";
const orAcc = (cpu, value) => {
  const result = cpu.a | value;
  cpu.flags.s = !!(result & 128);
  cpu.flags.z = !(result & 255);
  cpu.flags.h = false;
  cpu.flags.pv = parity(result);
  cpu.flags.n = false;
  cpu.flags.c = false;
  cpu.a = result;
};
orAcc.fname = "or";
const cpAcc = (cpu, value) => {
  let result = cpu.a - value;
  cpu.flags.s = !!(result & 128);
  cpu.flags.z = !(result & 255);
  cpu.flags.h = !!((cpu.a & 15) - (value & 15) & 16);
  if ((cpu.a & 128) === (value & 128))
    cpu.flags.pv = false;
  else
    cpu.flags.pv = (result & 128) !== (cpu.a & 128);
  cpu.flags.n = true;
  cpu.flags.c = !!(result & 256);
};
cpAcc.fname = "cp";

var alu = /*#__PURE__*/Object.freeze({
    __proto__: null,
    [Symbol.toStringTag]: 'Module',
    parity: parity,
    io_in: io_in,
    bit_y: bit_y,
    add16: add16,
    adc16: adc16,
    sbc16: sbc16,
    inc8: inc8,
    dec8: dec8,
    rlc: rlc,
    rrc: rrc,
    rl: rl,
    rr: rr,
    sla: sla,
    sra: sra,
    sll: sll,
    srl: srl,
    ldi: ldi,
    ldir: ldir,
    ldd: ldd,
    lddr: lddr,
    cpi: cpi,
    cpir: cpir,
    cpd: cpd,
    cpdr: cpdr,
    ini: ini,
    inir: inir,
    ind: ind,
    indr: indr,
    outi: outi,
    otir: otir,
    outd: outd,
    otdr: otdr,
    addAcc: addAcc,
    adcAcc: adcAcc,
    subAcc: subAcc,
    sbcAcc: sbcAcc,
    andAcc: andAcc,
    xorAcc: xorAcc,
    orAcc: orAcc,
    cpAcc: cpAcc
});

const toHex = (value, padding) => {
  let result = value.toString(16);
  if (padding)
    result = result.padStart(padding, "0");
  return result;
};
const testBit = (bit, value) => {
  return !!(value & 1 << bit);
};
const toSigned = (byte) => {
  return byte << 24 >> 24;
};

const get = (instructionConstructor, params) => {
  return { instructionConstructor, params };
};
const nop = (cpu) => {
  return {
    execute: () => {
      cpu.tstates += 4;
    },
    disassembly: () => "nop"
  };
};
const noni = (cpu) => {
  return {
    execute: () => {
      cpu.iff1 = false;
      cpu.iff2 = false;
      cpu.eiRequested = true;
      cpu.tstates += 8;
    },
    disassembly: () => "noni"
  };
};
const ex_af_af1 = (cpu) => {
  return {
    execute: () => {
      const tmpA = cpu.registers[RegisterName.A];
      const tmpF = cpu.registers[RegisterName.F];
      cpu.registers[RegisterName.A] = cpu.shadowRegisters[RegisterName.A];
      cpu.registers[RegisterName.F] = cpu.shadowRegisters[RegisterName.F];
      cpu.shadowRegisters[RegisterName.A] = tmpA;
      cpu.shadowRegisters[RegisterName.F] = tmpF;
      const tmpFlags = cpu.flags;
      cpu.flags = cpu.shadowFlags;
      cpu.shadowFlags = tmpFlags;
      cpu.tstates += 4;
    },
    disassembly: () => "ex af af`"
  };
};
const djnz_d = (cpu) => {
  return {
    execute: () => {
      const d = cpu.next8Signed();
      cpu.b--;
      if (cpu.b != 0) {
        cpu.pc += d;
        cpu.tstates += 13;
      } else
        cpu.tstates += 8;
    },
    disassembly: () => `djnz D`
  };
};
const jr_d = (cpu) => {
  return {
    execute: () => {
      const d = cpu.next8Signed();
      cpu.pc += d;
      cpu.tstates += 12;
    },
    disassembly: () => `jr D`
  };
};
const jr_cc = (cpu, p) => {
  return {
    execute: () => {
      const d = cpu.next8Signed();
      if (p.cc(cpu)) {
        cpu.pc += d;
        cpu.tstates += 12;
      } else
        cpu.tstates += 7;
    },
    disassembly: () => `jr ${p.cc.fname}, D`
  };
};
const ld_rp_nn = (cpu, p) => {
  return {
    execute: () => {
      cpu[p.rp] = cpu.next16();
      cpu.tstates += 10;
    },
    disassembly: () => `ld ${p.rp}, NN`
  };
};
const add_rp_rp = (cpu, p) => {
  return {
    execute: () => {
      cpu[p.dst] = add16(cpu, cpu[p.dst], cpu[p.src]);
      cpu.tstates += 11;
    },
    disassembly: () => `add ${p.dst}, ${p.src}`
  };
};
const ld_mem_rp_a = (cpu, p) => {
  return {
    execute: () => {
      cpu.bus.write8(cpu[p.rp], cpu.a);
      cpu.tstates += 7;
    },
    disassembly: () => `ld (${p.rp}), a`
  };
};
const ld_mem_nn_a = (cpu) => {
  return {
    execute: () => {
      cpu.bus.write8(cpu.next16(), cpu.a);
      cpu.tstates += 13;
    },
    disassembly: () => `ld (NN), a`
  };
};
const ld_a_mem_rp = (cpu, p) => {
  return {
    execute: () => {
      cpu.a = cpu.bus.read8(cpu[p.rp]);
      cpu.tstates += 7;
    },
    disassembly: () => `ld a, (${p.rp})`
  };
};
const ld_a_mem_nn = (cpu) => {
  return {
    execute: () => {
      cpu.a = cpu.bus.read8(cpu.next16());
      cpu.tstates += 13;
    },
    disassembly: () => `ld a, (NN)`
  };
};
const inc_rp = (cpu, p) => {
  return {
    execute: () => {
      cpu[p.rp]++;
      cpu.tstates += 6;
    },
    disassembly: () => `inc ${p.rp}`
  };
};
const dec_rp = (cpu, p) => {
  return {
    execute: () => {
      cpu[p.rp]--;
      cpu.tstates += 6;
    },
    disassembly: () => `dec ${p.rp}`
  };
};
const inc_r = (cpu, p) => {
  return {
    execute: () => {
      cpu[p.rs] = inc8(cpu, cpu[p.rs]);
      cpu.tstates += p.rs.startsWith("(") ? 11 : 4;
    },
    disassembly: () => `inc ${p.rs}`
  };
};
const inc_idx = (cpu, p) => {
  return {
    execute: () => {
      const d = cpu.next8Signed();
      const byte = cpu.bus.read8(cpu[p.idx] + d);
      cpu.bus.write8(cpu[p.idx] + d, inc8(cpu, byte));
      cpu.tstates += 23;
    },
    disassembly: () => `inc (${p.idx} + D)`
  };
};
const dec_idx = (cpu, p) => {
  return {
    execute: () => {
      const d = cpu.next8Signed();
      const byte = cpu.bus.read8(cpu[p.idx] + d);
      cpu.bus.write8(cpu[p.idx] + d, dec8(cpu, byte));
      cpu.tstates += 23;
    },
    disassembly: () => `inc (${p.idx} + D)`
  };
};
const dec_r = (cpu, p) => {
  return {
    execute: () => {
      cpu[p.rs] = dec8(cpu, cpu[p.rs]);
      cpu.tstates += p.rs.startsWith("(") ? 11 : 4;
    },
    disassembly: () => `dec ${p.rs}`
  };
};
const ld_r_n = (cpu, p) => {
  return {
    execute: () => {
      cpu[p.rs] = cpu.next8();
      cpu.tstates += p.rs.startsWith("(") ? 10 : 7;
    },
    disassembly: () => `ld ${p.rs}, N`
  };
};
const rot_a = (cpu, p) => {
  return {
    execute: () => {
      const [z, s, pv] = [cpu.flags.z, cpu.flags.s, cpu.flags.pv];
      cpu.a = p.rot(cpu, cpu.a);
      cpu.flags.z = z;
      cpu.flags.s = s;
      cpu.flags.pv = pv;
      cpu.tstates += 4;
    },
    disassembly: () => `${p.rot.fname}a`
  };
};
const daa = (cpu) => {
  return {
    execute: () => {
      const a = cpu.a;
      if ((a & 15) > 9 || cpu.flags.h) {
        cpu.a = cpu.flags.n ? cpu.a - 6 : cpu.a + 6;
      }
      if (a > 153 || cpu.flags.c) {
        cpu.a = cpu.flags.n ? cpu.a - 96 : cpu.a + 96;
      }
      if (cpu.flags.n) {
        cpu.flags.h = cpu.flags.h && (a & 15) <= 5;
      } else {
        cpu.flags.h = (a & 15) >= 10;
      }
      cpu.flags.c = cpu.flags.c || a > 153;
      cpu.flags.s = !!(cpu.a & 128);
      cpu.flags.z = cpu.a === 0;
      cpu.flags.pv = parity(cpu.a);
      cpu.tstates += 4;
    },
    disassembly: () => "daa"
  };
};
const cpl = (cpu) => {
  return {
    execute: () => {
      cpu.a = ~cpu.a;
      cpu.flags.h = true;
      cpu.flags.n = true;
      cpu.tstates += 4;
    },
    disassembly: () => "cpl"
  };
};
const scf = (cpu) => {
  return {
    execute: () => {
      cpu.flags.c = true;
      cpu.flags.h = false;
      cpu.flags.n = false;
      cpu.tstates += 4;
    },
    disassembly: () => "scf"
  };
};
const ccf = (cpu) => {
  return {
    execute: () => {
      cpu.flags.h = cpu.flags.c;
      cpu.flags.c = !cpu.flags.c;
      cpu.flags.n = false;
      cpu.tstates += 4;
    },
    disassembly: () => "ccf"
  };
};
const halt = (cpu) => {
  return {
    execute: () => {
      cpu.halted = true;
      cpu.tstates += 4;
    },
    disassembly: () => "halt"
  };
};
const ld_r_r = (cpu, p) => {
  return {
    execute: () => {
      cpu[p.dst] = cpu[p.src];
      cpu.tstates += p.dst.startsWith("(") || p.src.startsWith("(") ? 7 : 4;
    },
    disassembly: () => `ld ${p.dst}, ${p.src}`
  };
};
const ld_idx_n = (cpu, p) => {
  return {
    execute: () => {
      const d = cpu.next8Signed();
      const n = cpu.next8();
      cpu.bus.write8(cpu[p.idx] + d, n);
      cpu.tstates += 19;
    },
    disassembly: () => `ld (${p.idx} + D), N`
  };
};
const alu_r = (cpu, p) => {
  return {
    execute: () => {
      p.acc(cpu, cpu[p.rs]);
      cpu.tstates += p.rs === "(hl)" ? 7 : 4;
    },
    disassembly: () => `${p.acc.fname} ${p.rs}`
  };
};
const ret_cc = (cpu, p) => {
  return {
    execute: () => {
      if (p.cc(cpu)) {
        cpu.pc = cpu.pop16();
        cpu.tstates += 11;
      } else
        cpu.tstates += 5;
    },
    disassembly: () => `ret ${p.cc.fname}`
  };
};
const pop_rp = (cpu, p) => {
  return {
    execute: () => {
      cpu[p.rp] = cpu.pop16();
      cpu.tstates += 10;
    },
    disassembly: () => `pop ${p.rp}`
  };
};
const ret = (cpu) => {
  return {
    execute: () => {
      cpu.pc = cpu.pop16();
      cpu.tstates += 10;
    },
    disassembly: () => "ret"
  };
};
const exx = (cpu) => {
  return {
    execute: () => {
      const tmp = cpu.registers;
      cpu.registers = cpu.shadowRegisters;
      cpu.shadowRegisters = tmp;
      const tmpA = cpu.registers[RegisterName.A];
      cpu.registers[RegisterName.A] = cpu.shadowRegisters[RegisterName.A];
      cpu.shadowRegisters[RegisterName.A] = tmpA;
      cpu.tstates += 4;
    },
    disassembly: () => "exx"
  };
};
const jp_rp = (cpu, p) => {
  return {
    execute: () => {
      cpu.pc = cpu[p.rp];
      cpu.tstates += 4;
    },
    disassembly: () => `jp ${p.rp}`
  };
};
const ld_sp_rp = (cpu, p) => {
  return {
    execute: () => {
      cpu.sp = cpu[p.rp];
      cpu.tstates += 6;
    },
    disassembly: () => `ld sp, ${p.rp}`
  };
};
const jp_cc_nn = (cpu, p) => {
  return {
    execute: () => {
      const nn = cpu.next16();
      if (p.cc(cpu)) {
        cpu.pc = nn;
      }
      cpu.tstates += 10;
    },
    disassembly: () => `jp ${p.cc.fname}, NN`
  };
};
const jp_nn = (cpu) => {
  return {
    execute: () => {
      cpu.pc = cpu.next16();
      cpu.tstates += 10;
    },
    disassembly: () => `jp NN`
  };
};
const rot_r = (cpu, p) => {
  return {
    execute: () => {
      cpu[p.rs] = p.rot(cpu, cpu[p.rs]);
      cpu.tstates += p.rs === "(hl)" ? 15 : 8;
    },
    disassembly: () => `${p.rot.fname} ${p.rs}`
  };
};
const bit_y_r = (cpu, p) => {
  return {
    execute: () => {
      bit_y(cpu, cpu[p.rs], p.y);
      cpu.tstates += 8;
      if (p.rs === "(hl)")
        cpu.tstates += 4;
    },
    disassembly: () => `bit ${p.y}, ${p.rs}`
  };
};
const res_y_r = (cpu, p) => {
  return {
    execute: () => {
      const mask = 1 << p.y;
      cpu[p.rs] &= ~mask;
      cpu.tstates += 8;
      if (p.rs === "(hl)")
        cpu.tstates += 7;
    },
    disassembly: () => `res ${p.y}, ${p.rs}`
  };
};
const set_y_r = (cpu, p) => {
  return {
    execute: () => {
      cpu[p.rs] |= 1 << p.y;
      cpu.tstates += 8;
      if (p.rs === "(hl)")
        cpu.tstates += 7;
    },
    disassembly: () => `set ${p.y}, ${p.rs}`
  };
};
const out_n_a = (cpu) => {
  return {
    execute: () => {
      cpu.bus.out(cpu.next8(), cpu.a);
      cpu.tstates += 11;
    },
    disassembly: () => `out (N), a`
  };
};
const in_a_n = (cpu) => {
  return {
    execute: () => {
      cpu.a = cpu.bus.in(cpu.next8());
      cpu.tstates += 11;
    },
    disassembly: () => `in a, (N)`
  };
};
const ex_mem_sp_rp = (cpu, p) => {
  return {
    execute: () => {
      let tmp = cpu.bus.read16(cpu.sp);
      cpu.bus.write16(cpu.sp, cpu[p.rp]);
      cpu[p.rp] = tmp;
      cpu.tstates += 19;
    },
    disassembly: () => `ex (sp), ${p.rp}`
  };
};
const ex_de_hl = (cpu) => {
  return {
    execute: () => {
      const tmpDe = cpu.de;
      cpu.de = cpu.hl;
      cpu.hl = tmpDe;
      cpu.tstates += 4;
    },
    disassembly: () => "ex de, hl"
  };
};
const di = (cpu) => {
  return {
    execute: () => {
      cpu.iff1 = false;
      cpu.iff2 = false;
      cpu.tstates += 4;
    },
    disassembly: () => "di"
  };
};
const ei = (cpu) => {
  return {
    execute: () => {
      cpu.eiRequested = true;
      cpu.tstates += 4;
    },
    disassembly: () => "ei"
  };
};
const push_rp = (cpu, p) => {
  return {
    execute: () => {
      cpu.push16(cpu[p.rp]);
      cpu.tstates += 11;
    },
    disassembly: () => `push ${p.rp}`
  };
};
const call_nn = (cpu) => {
  return {
    execute: () => {
      const nn = cpu.next16();
      cpu.push16(cpu.pc);
      cpu.pc = nn;
      cpu.tstates += 17;
    },
    disassembly: () => `call NN`
  };
};
const call_cc_nn = (cpu, p) => {
  return {
    execute: () => {
      const nn = cpu.next16();
      if (p.cc(cpu)) {
        cpu.push16(cpu.pc);
        cpu.pc = nn;
        cpu.tstates += 17;
      } else
        cpu.tstates += 10;
    },
    disassembly: () => `call ${p.cc.fname}, NN`
  };
};
const alu_n = (cpu, p) => {
  return {
    execute: () => {
      p.acc(cpu, cpu.next8());
      cpu.tstates += 7;
    },
    disassembly: () => `${p.acc.fname} N`
  };
};
const rst = (cpu, p) => {
  return {
    execute: () => {
      cpu.push16(cpu.pc);
      cpu.pc = p.address;
      cpu.tstates += 11;
    },
    disassembly: () => `RST $${toHex(p.address, 4)}`
  };
};
const in_c = (cpu) => {
  return {
    execute: () => {
      io_in(cpu, cpu.c);
      cpu.tstates += 12;
    },
    disassembly: () => "in (c)"
  };
};
const in_r_c = (cpu, p) => {
  return {
    execute: () => {
      cpu[p.rs] = io_in(cpu, cpu.c);
      cpu.tstates += 12;
    },
    disassembly: () => `in ${p.rs}, (c)`
  };
};
const out_c_0 = (cpu) => {
  return {
    execute: () => {
      cpu.bus.out(cpu.c, 0);
      cpu.tstates += 12;
    },
    disassembly: () => "out (c), 0"
  };
};
const out_c_r = (cpu, p) => {
  return {
    execute: () => {
      cpu.bus.out(cpu.c, cpu[p.rs]);
      cpu.tstates += 12;
    },
    disassembly: () => `out (c), ${p.rs}`
  };
};
const sbc_hl_rp = (cpu, p) => {
  return {
    execute: () => {
      cpu.hl = sbc16(cpu, cpu.hl, cpu[p.rp]);
      cpu.tstates += 15;
    },
    disassembly: () => `sbc hl, ${p.rp}`
  };
};
const adc_hl_rp = (cpu, p) => {
  return {
    execute: () => {
      cpu.hl = adc16(cpu, cpu.hl, cpu[p.rp]);
      cpu.tstates += 15;
    },
    disassembly: () => `adc hl, ${p.rp}`
  };
};
const ld_mem_nn_rp = (cpu, p) => {
  return {
    execute: () => {
      cpu.bus.write16(cpu.next16(), cpu[p.rp]);
      cpu.tstates += p.rp === "hl" || p.rp.startsWith("i") ? 16 : 20;
    },
    disassembly: () => `ld (NN), ${p.rp}`
  };
};
const ld_rp_mem_nn = (cpu, p) => {
  return {
    execute: () => {
      cpu[p.rp] = cpu.bus.read16(cpu.next16());
      cpu.tstates += p.rp === "hl" || p.rp.startsWith("i") ? 16 : 20;
    },
    disassembly: () => `ld ${p.rp}, (NN)`
  };
};
const neg = (cpu) => {
  return {
    execute: () => {
      const result = 0 - cpu.a & 255;
      cpu.flags.pv = cpu.a === 128;
      cpu.flags.c = cpu.a !== 0;
      cpu.flags.h = !!(0 - (cpu.a & 15) && 16);
      cpu.flags.s = !!(result & 128);
      cpu.flags.z = !result;
      cpu.flags.n = true;
      cpu.a = result;
      cpu.tstates += 8;
    },
    disassembly: () => "neg"
  };
};
const reti = (cpu) => {
  return {
    execute: () => {
      cpu.pc = cpu.pop16();
      cpu.iff1 = cpu.iff2;
      cpu.tstates += 14;
    },
    disassembly: () => "reti"
  };
};
const retn = (cpu) => {
  return {
    execute: () => {
      cpu.pc = cpu.pop16();
      cpu.iff1 = cpu.iff2;
      cpu.handlingReset = false;
      cpu.tstates += 14;
    },
    disassembly: () => "retn"
  };
};
const im$1 = (cpu, p) => {
  return {
    execute: () => {
      cpu.interruptMode = p.im;
      cpu.tstates += 8;
    },
    disassembly: () => p.im === void 0 ? "im 0/1" : `im ${p.im}`
  };
};
const rot_idx = (cpu, p) => {
  return {
    execute: () => {
      const address = cpu[p.idx] + cpu.next8Signed();
      cpu.pc++;
      cpu.bus.write8(address, p.rot(cpu, cpu.bus.read8(address)));
      cpu.tstates += 23;
    },
    disassembly: () => `${p.rot.fname} (${p.idx} + D)`
  };
};
const ld_r_rot_idx = (cpu, p) => {
  return {
    execute: () => {
      const address = cpu[p.idx] + cpu.next8Signed();
      cpu.pc++;
      cpu.bus.write8(address, p.rot(cpu, cpu.bus.read8(address)));
      cpu[p.rs] = cpu.bus.read8(address);
      cpu.tstates += 23;
    },
    disassembly: () => `${p.rot.fname} (${p.idx} + D), ${p.rs}`
  };
};
const bit_y_idx = (cpu, p) => {
  return {
    execute: () => {
      const address = cpu[p.idx] + cpu.next8Signed();
      cpu.pc++;
      bit_y(cpu, cpu.bus.read8(address), p.y);
      cpu.tstates += 20;
    },
    disassembly: () => `bit ${p.y}, (${p.idx} + D)`
  };
};
const res_y_idx = (cpu, p) => {
  return {
    execute: () => {
      const address = cpu[p.idx] + cpu.next8Signed();
      cpu.pc++;
      const result = ~(1 << p.y) & cpu.bus.read8(address);
      cpu.bus.write8(address, result);
      cpu.tstates += 23;
    },
    disassembly: () => `res ${p.y}, (${p.idx} + D)`
  };
};
const ld_res_y_idx = (cpu, p) => {
  return {
    execute: () => {
      const address = cpu[p.idx] + cpu.next8Signed();
      cpu.pc++;
      const result = ~(1 << p.y) & cpu.bus.read8(address);
      cpu.bus.write8(address, result);
      cpu[p.rs] = cpu.bus.read8(address);
      cpu.tstates += 23;
    },
    disassembly: () => `res ${p.y}, (${p.idx} + D), ${p.rs}`
  };
};
const set_y_idx = (cpu, p) => {
  return {
    execute: () => {
      const address = cpu[p.idx] + cpu.next8Signed();
      cpu.pc++;
      const result = 1 << p.y | cpu.bus.read8(address);
      cpu.bus.write8(address, result);
      cpu.tstates += 23;
    },
    disassembly: () => `set ${p.y}, (${p.idx} + D)`
  };
};
const ld_set_y_idx = (cpu, p) => {
  return {
    execute: () => {
      const address = cpu[p.idx] + cpu.next8Signed();
      cpu.pc++;
      const result = 1 << p.y | cpu.bus.read8(address);
      cpu.bus.write8(address, result);
      cpu[p.rs] = cpu.bus.read8(address);
      cpu.tstates += 23;
    },
    disassembly: () => `set ${p.y}, (${p.idx} + D), ${p.rs}`
  };
};
const block_single = (cpu, p) => {
  return {
    execute: () => {
      p.bli(cpu);
      cpu.tstates += 16;
    },
    disassembly: () => `${p.bli.fname}`
  };
};
const block_io = (cpu, p) => {
  return {
    execute: () => {
      p.bli(cpu);
      cpu.tstates += cpu.b === 0 ? 16 : 21;
    },
    disassembly: () => `${p.bli.fname}`
  };
};
const block_load = (cpu, p) => {
  return {
    execute: () => {
      const r = p.bli(cpu);
      cpu.tstates += r ? 16 : 21;
    },
    disassembly: () => `${p.bli.fname}`
  };
};
const rrd = (cpu) => {
  return {
    execute: () => {
      const a = cpu.a;
      const byte = cpu.bus.read8(cpu.hl);
      cpu.a = cpu.a & 240 | byte & 15;
      cpu.bus.write8(cpu.hl, (a & 15) << 4 | byte >>> 4);
      cpu.flags.s = !!(cpu.a & 128);
      cpu.flags.z = !cpu.a;
      cpu.flags.h = false;
      cpu.flags.pv = parity(cpu.a);
      cpu.flags.n = false;
      cpu.tstates += 18;
    },
    disassembly: () => "rrd"
  };
};
const rld = (cpu) => {
  return {
    execute: () => {
      const a = cpu.a;
      const byte = cpu.bus.read8(cpu.hl);
      cpu.a = cpu.a & 240 | byte >>> 4;
      cpu.bus.write8(cpu.hl, byte << 4 | a & 15);
      cpu.flags.s = !!(cpu.a & 128);
      cpu.flags.z = !cpu.a;
      cpu.flags.h = false;
      cpu.flags.pv = parity(cpu.a);
      cpu.flags.n = false;
      cpu.tstates += 18;
    },
    disassembly: () => "rld"
  };
};
const ld_a_i = (cpu) => {
  return {
    execute: () => {
      cpu.a = cpu.i;
      cpu.flags.s = !!(cpu.a & 128);
      cpu.flags.z = !cpu.a;
      cpu.flags.h = false;
      cpu.flags.pv = cpu.iff2;
      cpu.flags.n = false;
      cpu.tstates += 9;
    },
    disassembly: () => "ld a, i"
  };
};
const ld_i_a = (cpu) => {
  return {
    execute: () => {
      cpu.i = cpu.a;
      cpu.tstates += 9;
    },
    disassembly: () => "ld i, a"
  };
};
const ld_a_r = (cpu) => {
  return {
    execute: () => {
      cpu.a = cpu.r;
      cpu.flags.s = !!(cpu.a & 128);
      cpu.flags.z = !cpu.a;
      cpu.flags.h = false;
      cpu.flags.pv = cpu.iff2;
      cpu.flags.n = false;
      cpu.tstates += 9;
    },
    disassembly: () => "ld a, r"
  };
};
const ld_r_a = (cpu) => {
  return {
    execute: () => {
      cpu.r = cpu.a;
      cpu.tstates += 9;
    },
    disassembly: () => "ld r, a"
  };
};

const registerPairs = [
  "af",
  "bc",
  "de",
  "hl",
  "pc",
  "sp",
  "ix",
  "iy"
];
const rs = ["b", "c", "d", "e", "h", "l", "(hl)", "a"];
const rp = ["bc", "de", "hl", "sp"];
const rp2 = ["bc", "de", "hl", "af"];
const acc = [
  addAcc,
  adcAcc,
  subAcc,
  sbcAcc,
  andAcc,
  xorAcc,
  orAcc,
  cpAcc
];
const rot = [
  rlc,
  rrc,
  rl,
  rr,
  sla,
  sra,
  sll,
  srl
];
const bli = [
  [],
  [],
  [],
  [],
  [ldi, cpi, ini, outi],
  [ldd, cpd, ind, outd],
  [ldir, cpir, inir, otir],
  [lddr, cpdr, indr, otdr]
];
const im = [0, void 0, 1, 2, 0, void 0, 1, 2];
const nz = (cpu) => !cpu.flags.z;
nz.fname = "nz";
const z = (cpu) => cpu.flags.z;
z.fname = "z";
const nc = (cpu) => !cpu.flags.c;
nc.fname = "nc";
const c = (cpu) => cpu.flags.c;
c.fname = "c";
const po = (cpu) => !cpu.flags.pv;
po.fname = "po";
const pe = (cpu) => cpu.flags.pv;
pe.fname = "pe";
const p = (cpu) => !cpu.flags.s;
p.fname = "p";
const m = (cpu) => cpu.flags.s;
m.fname = "m";
const cc = [nz, z, nc, c, po, pe, p, m];
const decode = (op, cpu) => {
  switch (op) {
    case 237:
      return decodeEd(cpu.next8());
    case 203:
      return decodeCb(cpu.next8());
    case 221: {
      op = cpu.next8();
      if (op === 253 || op === 221) {
        cpu.tstates += 4;
        cpu.pc--;
        return get(nop);
      }
      if (op === 203)
        return decodeIdxcb(cpu.bus.read8(cpu.pc + 1), "ix");
      const decoded = decodeIdx(op, "ix");
      cpu.tstates += calculateExtraTstates(decoded);
      return decoded;
    }
    case 253: {
      op = cpu.next8();
      if (op === 253 || op === 221) {
        cpu.tstates += 4;
        cpu.pc--;
        return get(nop);
      }
      if (op === 203)
        return decodeIdxcb(cpu.bus.read8(cpu.pc + 1), "iy");
      const decoded = decodeIdx(op, "iy");
      cpu.tstates += calculateExtraTstates(decoded);
      return decoded;
    }
    default:
      return decodeBase(op);
  }
};
const calculateExtraTstates = ({ params }) => {
  let tstatesToAdd = 0;
  if (params) {
    ["src", "dst", "rp", "rs"].map((p2) => {
      if (params[p2]) {
        if (params[p2].startsWith("i"))
          tstatesToAdd = 4;
        if (params[p2].startsWith("(i"))
          tstatesToAdd = 12;
      }
    });
  }
  return tstatesToAdd;
};
const decodeBase = (op) => {
  const [x, y, z2, p2, q] = opPatterns(op);
  switch (x) {
    case 0:
      switch (z2) {
        case 0:
          if (y === 0)
            return get(nop);
          if (y === 1)
            return get(ex_af_af1);
          if (y === 2)
            return get(djnz_d);
          if (y === 3)
            return get(jr_d);
          if (4 <= y && y <= 7)
            return get(jr_cc, { cc: cc[y - 4] });
          return get(nop);
        case 1:
          if (q === 0)
            return get(ld_rp_nn, { rp: rp[p2] });
          if (q === 1)
            return get(add_rp_rp, { dst: rp[2], src: rp[p2] });
          return get(nop);
        case 2:
          if (q === 0) {
            if (p2 === 0)
              return get(ld_mem_rp_a, { rp: "bc" });
            if (p2 === 1)
              return get(ld_mem_rp_a, { rp: "de" });
            if (p2 === 2)
              return get(ld_mem_nn_rp, { rp: rp[p2] });
            if (p2 === 3)
              return get(ld_mem_nn_a);
          }
          if (q === 1) {
            if (p2 === 0)
              return get(ld_a_mem_rp, { rp: "bc" });
            if (p2 === 1)
              return get(ld_a_mem_rp, { rp: "de" });
            if (p2 === 2)
              return get(ld_rp_mem_nn, { rp: rp[p2] });
            if (p2 === 3)
              return get(ld_a_mem_nn);
          }
          return get(nop);
        case 3:
          if (q === 0)
            return get(inc_rp, { rp: rp[p2] });
          if (q === 1)
            return get(dec_rp, { rp: rp[p2] });
          return get(nop);
        case 4:
          return get(inc_r, { rs: rs[y] });
        case 5:
          return get(dec_r, { rs: rs[y] });
        case 6:
          return get(ld_r_n, { rs: rs[y] });
        case 7:
          switch (y) {
            case 0:
              return get(rot_a, { rot: rlc });
            case 1:
              return get(rot_a, { rot: rrc });
            case 2:
              return get(rot_a, { rot: rl });
            case 3:
              return get(rot_a, { rot: rr });
            case 4:
              return get(daa);
            case 5:
              return get(cpl);
            case 6:
              return get(scf);
            case 7:
              return get(ccf);
          }
        default:
          return get(nop);
      }
    case 1:
      if (z2 === 6 && y === 6)
        return get(halt);
      return get(ld_r_r, { dst: rs[y], src: rs[z2] });
    case 2:
      return get(alu_r, { acc: acc[y], rs: rs[z2] });
    case 3:
      switch (z2) {
        case 0:
          return get(ret_cc, { cc: cc[y] });
        case 1:
          if (q === 0)
            return get(pop_rp, { rp: rp2[p2] });
          if (q === 1) {
            if (p2 === 0)
              return get(ret);
            if (p2 === 1)
              return get(exx);
            if (p2 === 2)
              return get(jp_rp, { rp: rp[2] });
            if (p2 === 3)
              return get(ld_sp_rp, { rp: rp[2] });
          }
          return get(nop);
        case 2:
          return get(jp_cc_nn, { cc: cc[y] });
        case 3: {
          switch (y) {
            case 0:
              return get(jp_nn);
            case 1:
              break;
            case 2:
              return get(out_n_a);
            case 3:
              return get(in_a_n);
            case 4:
              return get(ex_mem_sp_rp, { rp: rp[2] });
            case 5:
              return get(ex_de_hl);
            case 6:
              return get(di);
            case 7:
              return get(ei);
            default:
              return get(nop);
          }
        }
        case 4:
          return get(call_cc_nn, { cc: cc[y] });
        case 5:
          if (q === 0)
            return get(push_rp, { rp: rp2[p2] });
          if (q === 1) {
            if (p2 === 0)
              return get(call_nn);
          }
          return get(nop);
        case 6:
          return get(alu_n, { acc: acc[y] });
        case 7:
          return get(rst, { address: y * 8 });
        default:
          return get(nop);
      }
  }
  return get(nop);
};
const decodeCb = (op) => {
  const [x, y, z2] = opPatterns(op);
  if (x === 0)
    return get(rot_r, { rot: rot[y], rs: rs[z2] });
  if (x === 1)
    return get(bit_y_r, { y, rs: rs[z2] });
  if (x === 2)
    return get(res_y_r, { y, rs: rs[z2] });
  if (x === 3)
    return get(set_y_r, { y, rs: rs[z2] });
  return get(nop);
};
const decodeEd = (op) => {
  const [x, y, z2, p2, q] = opPatterns(op);
  if (x === 0 || x === 3)
    return get(noni);
  if (x === 1) {
    switch (z2) {
      case 0:
        if (y === 6)
          return get(in_c);
        return get(in_r_c, { rs: rs[y] });
      case 1:
        if (y === 6)
          return get(out_c_0);
        return get(out_c_r, { rs: rs[y] });
      case 2:
        if (q === 0)
          return get(sbc_hl_rp, { rp: rp[p2] });
        if (q === 1)
          return get(adc_hl_rp, { rp: rp[p2] });
        break;
      case 3:
        if (q === 0)
          return get(ld_mem_nn_rp, { rp: rp[p2] });
        if (q === 1)
          return get(ld_rp_mem_nn, { rp: rp[p2] });
        break;
      case 4:
        return get(neg);
      case 5:
        if (y === 1)
          return get(reti);
        return get(retn);
      case 6:
        return get(im$1, { im: im[y] });
      case 7:
        switch (y) {
          case 0:
            return get(ld_i_a);
          case 1:
            return get(ld_r_a);
          case 2:
            return get(ld_a_i);
          case 3:
            return get(ld_a_r);
          case 4:
            return get(rrd);
          case 5:
            return get(rld);
        }
        break;
      default:
        return get(nop);
    }
  }
  if (x === 2) {
    if (z2 <= 3 && y >= 4) {
      if (y >= 6) {
        if (z2 >= 2)
          return get(block_io, { bli: bli[y][z2] });
        return get(block_load, { bli: bli[y][z2] });
      }
      return get(block_single, { bli: bli[y][z2] });
    }
    return get(noni);
  }
  return get(nop);
};
const decodeIdx = (op, idx) => {
  if (op === 52)
    return get(inc_idx, { idx });
  if (op === 53)
    return get(dec_idx, { idx });
  if (op === 54)
    return get(ld_idx_n, { idx });
  rp[2] = idx;
  rp2[2] = idx;
  rs[4] = `${idx}h`;
  rs[5] = `${idx}l`;
  rs[6] = `(${idx} + D)`;
  const [x, y, z2] = opPatterns(op);
  if (x === 1 && (y === 6 || z2 === 6)) {
    rs[4] = rs[4][2];
    rs[5] = rs[5][2];
  }
  const decoded = decodeBase(op);
  rp[2] = "hl";
  rp2[2] = "hl";
  rs[4] = "h";
  rs[5] = "l";
  rs[6] = "(hl)";
  return decoded;
};
const decodeIdxcb = (op, idx) => {
  const [x, y, z2] = opPatterns(op);
  switch (x) {
    case 0:
      if (z2 !== 6)
        return get(ld_r_rot_idx, { rot: rot[y], rs: rs[z2], idx });
      else
        return get(rot_idx, { rot: rot[y], idx });
    case 1:
      return get(bit_y_idx, { y, idx });
    case 2:
      if (z2 !== 6)
        return get(ld_res_y_idx, { y, rs: rs[z2], idx });
      else
        return get(res_y_idx, { y, idx });
    case 3:
      if (z2 !== 6)
        return get(ld_set_y_idx, { y, rs: rs[z2], idx });
      else
        return get(set_y_idx, { y, idx });
    default:
      return get(nop);
  }
};
const opPatterns = (op) => {
  const x = (op & 192) >>> 6;
  const y = (op & 56) >>> 3;
  const z2 = op & 7;
  const p2 = y >>> 1;
  const q = y % 2;
  return [x, y, z2, p2, q];
};

class Register {
  constructor(bytes) {
    this.bytes = bytes;
  }
  data = 0;
  get value() {
    return this.bytes === 1 ? this.data & 255 : this.data & 65535;
  }
  set value(value) {
    this.bytes === 1 ? this.data = value & 255 : this.data = value & 65535;
  }
}

const generateInstructionTable = (cpu) => {
  const baseTable = new Array(256);
  const edTable = new Array(256);
  const cbTable = new Array(256);
  const ixTable = new Array(256);
  const iyTable = new Array(256);
  const ixcbTable = new Array(256);
  const iycbTable = new Array(256);
  for (let op = 0; op <= 255; op++) {
    baseTable[op] = rewriteInstruction(cpu, decodeBase(op));
    edTable[op] = rewriteInstruction(cpu, decodeEd(op));
    cbTable[op] = rewriteInstruction(cpu, decodeCb(op));
    ixTable[op] = rewriteInstruction(cpu, decodeIdx(op, "ix"));
    iyTable[op] = rewriteInstruction(cpu, decodeIdx(op, "iy"));
    ixcbTable[op] = rewriteInstruction(cpu, decodeIdxcb(op, "ix"));
    iycbTable[op] = rewriteInstruction(cpu, decodeIdxcb(op, "iy"));
  }
  baseTable[237] = () => {
    edTable[cpu.next8()]();
  };
  baseTable[203] = () => {
    cbTable[cpu.next8()]();
  };
  baseTable[221] = () => {
    const op = cpu.next8();
    if (op === 221 || op === 253) {
      cpu.tstates += 4;
      cpu.pc--;
      return;
    }
    let instruction;
    if (op === 203)
      instruction = ixcbTable[cpu.bus.read8(cpu.pc + 1)];
    else
      instruction = ixTable[op];
    instruction();
  };
  baseTable[253] = () => {
    const op = cpu.next8();
    if (op === 221 || op === 253) {
      cpu.tstates += 4;
      cpu.pc--;
      return;
    }
    let instruction;
    if (op === 203)
      instruction = iycbTable[cpu.bus.read8(cpu.pc + 1)];
    else
      instruction = iyTable[op];
    instruction();
  };
  return baseTable;
};
const rewriteInstruction = (cpu, { instructionConstructor, params }) => {
  const s = instructionConstructor.toString();
  let [cpuVar, paramsVar] = s.slice(s.indexOf("(") + 1, s.indexOf(")")).split(",");
  if (paramsVar)
    paramsVar = paramsVar.trim();
  const instruction = instructionConstructor(cpu, params);
  let executeBody = instruction.execute.toString();
  executeBody = executeBody.slice(executeBody.indexOf("{") + 1, executeBody.lastIndexOf("}"));
  executeBody = executeBody.replaceAll(cpuVar, "this");
  if (params) {
    const stringParams = ["src", "dst", "rp", "rs", "idx"];
    stringParams.map((param) => {
      if (params[param]) {
        executeBody = executeBody.replaceAll(`${paramsVar}.${param}`, `'${params[param]}'`);
      }
    });
    const numberParams = ["im", "y", "address"];
    numberParams.map((param) => {
      if (params[param] !== void 0) {
        executeBody = executeBody.replaceAll(`${paramsVar}.${param}`, `${params[param]}`);
      }
    });
    const functionParams = ["bli", "rot", "cc", "acc"];
    functionParams.map((param) => {
      if (params[param]) {
        executeBody = executeBody.replaceAll(`${paramsVar}.${param}`, `(${params[param]})`);
      }
    });
  }
  if (executeBody.includes("RegisterName")) {
    executeBody = executeBody.replaceAll("RegisterName", "this.RegisterName");
  }
  for (let functionName of Object.keys(cpu.alu)) {
    if (executeBody.includes(`alu.${functionName}(`)) {
      executeBody = executeBody.replaceAll(`alu.${functionName}(`, `this.alu.${functionName}(`);
    } else if (executeBody.includes(`${functionName}(`)) {
      executeBody = executeBody.replaceAll(`${functionName}(`, `this.alu.${functionName}(`);
    }
  }
  let tstatesToAdd = calculateExtraTstates({ instructionConstructor, params });
  executeBody += `;this.tstates += ${tstatesToAdd};`;
  return Function(executeBody).bind(cpu);
};

var RegisterName;
(function(RegisterName2) {
  RegisterName2[RegisterName2["B"] = 0] = "B";
  RegisterName2[RegisterName2["C"] = 1] = "C";
  RegisterName2[RegisterName2["D"] = 2] = "D";
  RegisterName2[RegisterName2["E"] = 3] = "E";
  RegisterName2[RegisterName2["H"] = 4] = "H";
  RegisterName2[RegisterName2["L"] = 5] = "L";
  RegisterName2[RegisterName2["F"] = 6] = "F";
  RegisterName2[RegisterName2["A"] = 7] = "A";
})(RegisterName || (RegisterName = {}));
var DecodingMode;
(function(DecodingMode2) {
  DecodingMode2[DecodingMode2["TABLE"] = 0] = "TABLE";
  DecodingMode2[DecodingMode2["DECODE"] = 1] = "DECODE";
})(DecodingMode || (DecodingMode = {}));
class Cpu {
  constructor(bus) {
    this.bus = bus;
    this.registers = Array.from({ length: 8 }, () => new Register(1));
    this.shadowRegisters = Array.from({ length: 8 }, () => new Register(1));
    this.sp = 57328;
    this.bus.out(220, 255);
    this.bus.out(221, 255);
    if (this.decodingMode === 0) {
      this.instructionTable = generateInstructionTable(this);
    }
  }
  registers;
  shadowRegisters;
  _ix = new Register(2);
  _iy = new Register(2);
  _i = new Register(1);
  _r = new Register(1);
  _sp = new Register(2);
  _pc = new Register(2);
  flags = {
    s: false,
    z: false,
    y: false,
    h: false,
    x: false,
    pv: false,
    n: false,
    c: false
  };
  shadowFlags = {
    s: false,
    z: false,
    y: false,
    h: false,
    x: false,
    pv: false,
    n: false,
    c: false
  };
  tstates = 0;
  halted = false;
  interruptMode = 1;
  eiRequested = false;
  pausePressed = false;
  resetRequested = false;
  handlingReset = false;
  iff1 = false;
  iff2 = false;
  decodingMode = 0;
  instructionTable = [];
  alu = alu;
  RegisterName = RegisterName;
  step() {
    this.tstates = 0;
    if (this.handleInterrupts())
      return 13;
    if (this.halted)
      return 4;
    let op = this.next8();
    let instruction;
    if (this.decodingMode === 1) {
      let decoded = decode(op, this);
      instruction = decoded.instructionConstructor(this, decoded.params);
      instruction.execute();
    } else {
      this.instructionTable[op]();
    }
    this.incrementRefreshRegister();
    return this.tstates;
  }
  handleInterrupts() {
    let interrupt = false;
    if (this.pausePressed && this.bus.vdp.getVCounter() === 255) {
      this.pausePressed = false;
      this.handlingReset = true;
      this.iff2 = this.iff1;
      this.iff1 = false;
      this.halted = false;
      this.push16(this.pc);
      this.pc = 102;
      interrupt = true;
    } else if (this.iff1 && this.bus.vdp.requestedInterrupt) {
      this.bus.vdp.requestedInterrupt = false;
      this.iff1 = this.iff2 = false;
      this.halted = false;
      this.push16(this.pc);
      this.pc = this.interruptMode === 1 ? 56 : this.i << 8;
      interrupt = true;
    }
    if (this.eiRequested) {
      this.iff1 = true;
      this.iff2 = true;
      this.eiRequested = false;
    }
    return interrupt;
  }
  push8(value) {
    this.sp--;
    this.bus.write8(this.sp, value);
  }
  pop8() {
    return this.bus.read8(this.sp++);
  }
  push16(value) {
    this.push8(value >>> 8);
    this.push8(value & 255);
  }
  pop16() {
    return this.pop8() + (this.pop8() << 8);
  }
  next8() {
    return this.bus.read8(this.pc++);
  }
  next8Signed() {
    return toSigned(this.next8());
  }
  next16() {
    const value = this.bus.read16(this.pc);
    this.pc += 2;
    return value;
  }
  incrementRefreshRegister() {
    this.r = this.r & 128 | this.r + 1 & 127;
  }
  get r() {
    return this._r.value;
  }
  set r(value) {
    this._r.value = value;
  }
  get i() {
    return this._i.value;
  }
  set i(value) {
    this._i.value = value;
  }
  get ["(ix + D)"]() {
    return this.bus.read8(this.ix + this.next8Signed());
  }
  set ["(ix + D)"](value) {
    this.bus.write8(this.ix + this.next8Signed(), value);
  }
  get ["(iy + D)"]() {
    return this.bus.read8(this.iy + this.next8Signed());
  }
  set ["(iy + D)"](value) {
    this.bus.write8(this.iy + this.next8Signed(), value);
  }
  get ["(ix)"]() {
    return this.bus.read8(this.ix);
  }
  set ["(ix)"](value) {
    this.bus.write8(this.ix, value);
  }
  get ["(iy)"]() {
    return this.bus.read8(this.iy);
  }
  set ["(iy)"](value) {
    this.bus.write8(this.iy, value);
  }
  get ix() {
    return this._ix.value;
  }
  set ix(value) {
    this._ix.value = value;
  }
  get iy() {
    return this._iy.value;
  }
  set iy(value) {
    this._iy.value = value;
  }
  get ixh() {
    return this._ix.value >>> 8;
  }
  set ixh(value) {
    this._ix.value = this.ixl + (value << 8);
  }
  get ixl() {
    return this._ix.value & 255;
  }
  set ixl(value) {
    this._ix.value = (this.ixh << 8) + (value & 255);
  }
  get iyh() {
    return this._iy.value >>> 8;
  }
  set iyh(value) {
    this._iy.value = this.iyl + (value << 8);
  }
  get iyl() {
    return this._iy.value & 255;
  }
  set iyl(value) {
    this._iy.value = (this.iyh << 8) + (value & 255);
  }
  get ["(hl)"]() {
    return this.bus.read8(this.hl);
  }
  set ["(hl)"](value) {
    this.bus.write8(this.hl, value);
  }
  get af() {
    return (this.registers[7].value << 8) + this.f;
  }
  set af(value) {
    this.f = value & 255;
    this.registers[7].value = value >>> 8;
  }
  get bc() {
    return (this.registers[0].value << 8) + this.registers[1].value;
  }
  set bc(value) {
    this.registers[1].value = value & 255;
    this.registers[0].value = value >>> 8;
  }
  get de() {
    return (this.registers[2].value << 8) + this.registers[3].value;
  }
  set de(value) {
    this.registers[3].value = value & 255;
    this.registers[2].value = value >>> 8;
  }
  get hl() {
    return (this.registers[4].value << 8) + this.registers[5].value;
  }
  set hl(value) {
    this.registers[5].value = value & 255;
    this.registers[4].value = value >>> 8;
  }
  get a() {
    return this.registers[7].value;
  }
  set a(value) {
    this.registers[7].value = value;
  }
  get b() {
    return this.registers[0].value;
  }
  set b(value) {
    this.registers[0].value = value;
  }
  get c() {
    return this.registers[1].value;
  }
  set c(value) {
    this.registers[1].value = value;
  }
  get d() {
    return this.registers[2].value;
  }
  set d(value) {
    this.registers[2].value = value;
  }
  get e() {
    return this.registers[3].value;
  }
  set e(value) {
    this.registers[3].value = value;
  }
  get h() {
    return this.registers[4].value;
  }
  set h(value) {
    this.registers[4].value = value;
  }
  get l() {
    return this.registers[5].value;
  }
  set l(value) {
    this.registers[5].value = value;
  }
  get f() {
    let f = 0;
    let shift = 7;
    for (const flag of Object.values(this.flags)) {
      f |= +flag << shift;
      shift--;
    }
    return f;
  }
  set f(value) {
    let mask = 1 << 7;
    for (const flag of Object.keys(this.flags)) {
      this.flags[flag] = !!(value & mask);
      mask >>>= 1;
    }
    this.registers[6].value = value;
  }
  get pc() {
    return this._pc.value;
  }
  set pc(value) {
    this._pc.value = value;
  }
  get sp() {
    return this._sp.value;
  }
  set sp(value) {
    this._sp.value = value;
  }
}

class Sound {
  constructor(sampleRate, audioBuffer, playAudio, timing) {
    this.sampleRate = sampleRate;
    this.audioBuffer = audioBuffer;
    this.playAudio = playAudio;
    this.timing = timing;
    this.samplesPerFrame = this.sampleRate / timing.fps;
    this.tstatesPerSample = this.timing.tstatesPerFrame / this.samplesPerFrame;
    this.clocksPerSample = this.tstatesPerSample / 16;
    this.initVolumeTable();
  }
  samplesPerFrame;
  tstatesPerSample;
  clocksPerSample;
  volumeRegisters = [15, 15, 15, 15];
  volumeTable = new Array(16);
  maxVolume = 0.05;
  frequencyRegisters = [1, 1, 1, 1];
  frequencyCounters = [0, 0, 0, 0];
  frequencyOutputs = [1, 1, 1, 1];
  shiftRegister = 32768;
  latchedChannel = 0;
  latchedVolume = false;
  bufferIndex = 0;
  framesToQueue = 16;
  tstatesSinceLastSample = 0;
  initVolumeTable() {
    const twoDb = 0.8;
    let currVolume = this.maxVolume;
    for (let i = 0; i < 15; i++) {
      this.volumeTable[i] = currVolume;
      currVolume *= twoDb;
    }
    this.volumeTable[15] = 0;
  }
  update(tstates) {
    this.tstatesSinceLastSample += tstates;
    if (this.tstatesSinceLastSample < this.tstatesPerSample)
      return;
    this.tstatesSinceLastSample -= this.tstatesPerSample;
    let output = 0;
    for (let i = 0; i < 3; i++) {
      output += this.frequencyOutputs[i] * this.volumeTable[this.volumeRegisters[i]];
    }
    output += (this.shiftRegister & 1) * this.volumeTable[this.volumeRegisters[3]];
    this.audioBuffer[this.bufferIndex++] = output;
    const queuedFrames = this.bufferIndex / this.samplesPerFrame;
    if (queuedFrames === this.framesToQueue) {
      this.playAudio();
    }
    if (this.bufferIndex >= this.audioBuffer.length) {
      this.bufferIndex -= this.audioBuffer.length;
    }
    for (let i = 0; i < 3; i++) {
      this.frequencyCounters[i] -= this.clocksPerSample;
      if (this.frequencyCounters[i] <= 0) {
        if (this.frequencyRegisters[i] > 6) {
          this.frequencyOutputs[i] = -this.frequencyOutputs[i];
          this.frequencyCounters[i] += this.frequencyRegisters[i];
        } else {
          this.frequencyOutputs[i] = 1;
        }
      }
    }
    this.frequencyCounters[3] -= this.clocksPerSample;
    if (this.frequencyCounters[3] <= 0) {
      this.frequencyOutputs[3] = -this.frequencyOutputs[3];
      if ((this.frequencyRegisters[3] & 3) === 3) {
        this.frequencyCounters[3] += this.frequencyRegisters[2];
      } else {
        this.frequencyCounters[3] += 16 << (this.frequencyRegisters[3] & 3);
      }
      if (this.frequencyOutputs[3] === 1) {
        let feedback = 0;
        if (testBit(2, this.frequencyRegisters[3])) {
          feedback = +parity(this.shiftRegister & 9);
          this.shiftRegister = this.shiftRegister >> 1 | feedback << 15;
        } else {
          this.shiftRegister >>= 1;
          if (this.shiftRegister === 0)
            this.shiftRegister = 32768;
        }
      }
    }
  }
  write(value) {
    if (testBit(7, value)) {
      this.latchedChannel = value >> 5 & 3;
      if (testBit(4, value)) {
        this.volumeRegisters[this.latchedChannel] = value & 15;
        this.latchedVolume = true;
      } else {
        if (this.latchedChannel < 3)
          this.frequencyRegisters[this.latchedChannel] = this.frequencyRegisters[this.latchedChannel] & 1008 | value & 15;
        else {
          this.shiftRegister = 32768;
          this.frequencyRegisters[3] = value & 15;
        }
        this.latchedVolume = false;
      }
    } else {
      if (this.latchedVolume) {
        this.volumeRegisters[this.latchedChannel] = value & 15;
      } else {
        if (this.latchedChannel < 3) {
          this.frequencyRegisters[this.latchedChannel] = this.frequencyRegisters[this.latchedChannel] & 15 | (value & 63) << 4;
        } else {
          this.shiftRegister = 32768;
          this.frequencyRegisters[3] = value & 15;
        }
      }
    }
  }
}

class Vdp {
  constructor(videoMode, frameBuffer, drawFrame, timing) {
    this.videoMode = videoMode;
    this.frameBuffer = frameBuffer;
    this.drawFrame = drawFrame;
    this.timing = timing;
    this.registers[2] = 14;
    this.registers[5] = 126;
  }
  widthPixels = 256;
  heightPixels = 192;
  vram = new Uint8Array(2 ** 16);
  palette = new Array(32).fill({ r: 0, g: 0, b: 0 });
  registers = new Array(11).fill(0);
  backgroundTilesShifted = new Uint32Array(2 ** 14);
  codeRegister = 0;
  addressRegister = 0;
  renderedSpritePositions = new Array(300);
  vCounter = 5;
  hCounter = 0;
  hCounterBuffer = 0;
  lineCounter = 0;
  readBuffer = 0;
  vScrollBuffer = 0;
  firstControlByte = true;
  spriteOverflow = false;
  spriteCollision = false;
  frameInterruptPending = false;
  lineInterruptPending = false;
  requestedInterrupt = false;
  firstVInterrupt = true;
  firstHInterrupt = true;
  update(tstates) {
    this.hCounter += tstates * 3;
    this.generateInterrupts();
    if (this.hCounter < this.timing.tstatesPerScanline * 3)
      return;
    this.hCounter -= this.timing.tstatesPerScanline * 3;
    this.firstHInterrupt = true;
    this.firstVInterrupt = true;
    if (this.vCounter <= this.heightPixels) {
      if (this.lineCounter === 0) {
        this.lineCounter = this.registers[10];
      } else
        this.lineCounter--;
    }
    if (this.vCounter < this.heightPixels) {
      this.renderSprites();
      this.renderBackgroundTiles();
      this.renderBackdrop();
    }
    if (this.vCounter === this.heightPixels + 1 && this.displayEnabled()) {
      this.drawFrame();
    }
    if (this.vCounter === this.timing.scanlinesPerFrame - 1) {
      this.vCounter = 0;
      this.vScrollBuffer = this.registers[9];
      this.lineCounter = this.registers[10];
      this.lineInterruptPending = false;
    } else
      this.vCounter++;
  }
  generateInterrupts() {
    if (this.firstVInterrupt && this.hCounter >= 607 && this.vCounter === 193) {
      this.firstVInterrupt = false;
      this.frameInterruptPending = true;
    }
    if (this.firstHInterrupt && this.hCounter >= 608 && this.lineCounter === 0 && this.vCounter <= 192) {
      this.firstHInterrupt = false;
      this.lineInterruptPending = true;
    }
    this.requestedInterrupt = false;
    if (this.frameInterruptPending && testBit(5, this.registers[1])) {
      this.requestedInterrupt = true;
    }
    if (this.lineInterruptPending && testBit(4, this.registers[0])) {
      this.requestedInterrupt = true;
    }
  }
  getVCounter() {
    if (this.videoMode === VideoMode.NTSC && this.vCounter > 219) {
      return this.vCounter - 7;
    } else if (this.videoMode === VideoMode.PAL && this.vCounter > 243) {
      return this.vCounter - 58;
    }
    return this.vCounter - 1 & 255;
  }
  getHCounter() {
    return Math.round((this.hCounterBuffer - 94) / 4);
  }
  renderSprites() {
    this.renderedSpritePositions = new Array(300);
    let spriteWidth = 8;
    const spritesDoubled = testBit(1, this.registers[1]);
    let spriteHeight = spritesDoubled ? 16 : 8;
    const spritesZoomed = testBit(0, this.registers[1]);
    if (spritesZoomed) {
      spriteHeight *= 2;
      spriteWidth *= 2;
    }
    const scanline = this.vCounter;
    const spriteTableBaseAddress = (this.registers[5] & 126) << 7;
    const frameBaseAddress = scanline * this.widthPixels * 4;
    let spritesRendered = 0;
    for (let spriteNumber = 0; spriteNumber < 64; spriteNumber++) {
      let spriteY = this.vram[spriteTableBaseAddress + spriteNumber];
      spriteY = spriteY + 1 & 255;
      if (this.heightPixels === 192 && spriteY === 209)
        break;
      if (spriteY <= scanline && scanline < spriteY + spriteHeight) {
        if (spritesRendered === 8) {
          this.spriteOverflow = true;
          break;
        }
        spritesRendered++;
        let tableAddress = spriteTableBaseAddress + spriteNumber * 2;
        let spriteX = this.vram[tableAddress | 128];
        if (testBit(3, this.registers[0]))
          spriteX -= 8;
        let patternLine = scanline - spriteY;
        if (spritesZoomed) {
          patternLine = Math.floor(patternLine / 2);
        }
        let patternIndex = this.vram[tableAddress | 129];
        if (spritesDoubled) {
          patternIndex = patternLine <= 7 ? patternIndex & 254 : patternIndex | 1;
        }
        patternLine &= 7;
        if (testBit(2, this.registers[6]))
          patternIndex += 256;
        let patternAddress = patternIndex * 32 + patternLine * 4;
        let bitplanes = this.vram.slice(patternAddress, patternAddress + 4);
        if (spriteWidth === 16) {
          bitplanes = Array.from(bitplanes);
          bitplanes = bitplanes.map((bp) => {
            let stretched = 0;
            for (let pixel = 7; pixel >= 0; pixel--) {
              stretched <<= 1;
              stretched |= bp >> pixel & 1;
              stretched <<= 1;
              stretched |= bp >> pixel & 1;
            }
            return stretched;
          });
        }
        for (let pixel = 0; pixel < spriteWidth; pixel++) {
          let xPosition = spriteX + pixel;
          if (xPosition < 0)
            continue;
          if (xPosition >= this.widthPixels)
            break;
          const shift = spriteWidth - pixel - 1;
          let colorIndex = 0;
          for (let bp = 0; bp < 4; bp++) {
            colorIndex |= (bitplanes[bp] >>> shift & 1) << bp;
          }
          if (colorIndex === 0)
            continue;
          if (this.renderedSpritePositions[xPosition] && this.displayEnabled()) {
            this.spriteCollision = true;
            continue;
          }
          this.renderedSpritePositions[xPosition] = true;
          const color = this.palette[16 + colorIndex];
          this.writePixel(frameBaseAddress + xPosition * 4, color);
        }
      }
    }
  }
  renderBackgroundTiles() {
    let scanline = this.vCounter + this.vScrollBuffer;
    if (scanline >= 224)
      scanline -= 224;
    let row = this.vCounter >>> 3;
    let tileRow = scanline >>> 3;
    const startCol = 32 - (this.registers[8] >>> 3);
    let hFineScroll = this.registers[8] & 7;
    const frameBaseAddress = this.vCounter * this.widthPixels * 4;
    const tilesTableBase = this.tilesTableAddress();
    for (let col = 0; col < 32; col++) {
      let tileCol = startCol + col & 31;
      if (testBit(6, this.registers[0]) && row <= 1) {
        tileCol = col;
        hFineScroll = 0;
      }
      if (testBit(7, this.registers[0]) && col >= 24) {
        scanline = this.vCounter;
        tileRow = scanline >>> 3;
      }
      let tileEntryAddress = tilesTableBase + tileRow * 64 + tileCol * 2;
      if (!testBit(0, this.registers[2]))
        tileEntryAddress &= 64511;
      const lsb = this.vram[tileEntryAddress];
      const msb = this.vram[tileEntryAddress + 1];
      let patternNumber = (msb & 1) << 8 | lsb;
      let palette = +testBit(3, msb) << 4;
      let priority = testBit(4, msb);
      let horizontalFlip = testBit(1, msb);
      let verticalFlip = testBit(2, msb);
      let tileLine = scanline & 7;
      if (verticalFlip)
        tileLine = 7 - tileLine;
      const tileLineAddress = (patternNumber << 3) + tileLine;
      const lineIndexes = this.backgroundTilesShifted[tileLineAddress];
      for (let pixel = 0; pixel < 8; pixel++) {
        const x = (col << 3) + pixel + hFineScroll;
        if (x >= this.widthPixels)
          break;
        const shift = horizontalFlip ? pixel << 2 : 28 - (pixel << 2);
        const colorIndex = lineIndexes >> shift & 15;
        if (priority && colorIndex || !this.renderedSpritePositions[x]) {
          this.writePixel(frameBaseAddress + (x << 2), this.palette[colorIndex + palette]);
        }
      }
    }
  }
  renderBackdrop() {
    if (testBit(5, this.registers[0])) {
      const color = this.palette[16 + (this.registers[7] & 15)];
      const frameBaseAddress = this.vCounter * this.widthPixels * 4;
      for (let pixel = 0; pixel < 8; pixel++) {
        this.writePixel(frameBaseAddress + pixel * 4, color);
      }
    }
  }
  writePixel(address, color) {
    this.frameBuffer[address] = color.r;
    this.frameBuffer[address + 1] = color.g;
    this.frameBuffer[address + 2] = color.b;
    this.frameBuffer[address + 3] = 255;
  }
  interpolateColor(color) {
    let r = color & 3;
    let g = color >> 2 & 3;
    let b = color >> 4 & 3;
    return { r: r * 85, g: g * 85, b: b * 85 };
  }
  readControlPort() {
    const status = +this.frameInterruptPending << 7 | +this.spriteOverflow << 6 | +this.spriteCollision << 5;
    this.firstControlByte = true;
    this.frameInterruptPending = false;
    this.lineInterruptPending = false;
    this.requestedInterrupt = false;
    this.spriteCollision = false;
    this.spriteOverflow = false;
    return status;
  }
  writeControlPort(value) {
    value &= 255;
    if (this.firstControlByte) {
      this.firstControlByte = false;
      this.addressRegister = this.addressRegister & 16128 | value & 255;
    } else {
      this.firstControlByte = true;
      this.addressRegister = (value & 63) << 8 | this.addressRegister & 255;
      this.codeRegister = value >>> 6;
      if (this.codeRegister === 0) {
        this.readBuffer = this.vram[this.addressRegister];
        this.incrementAddress();
      } else if (this.codeRegister === 2) {
        const idx = value & 15;
        if (idx < 11)
          this.registers[idx] = this.addressRegister & 255;
        if (idx === 1 && testBit(5, value) && this.frameInterruptPending) {
          this.requestedInterrupt = true;
        }
      }
    }
  }
  readDataPort() {
    this.firstControlByte = true;
    const ret = this.readBuffer;
    this.readBuffer = this.vram[this.addressRegister];
    this.incrementAddress();
    return ret;
  }
  writeDataPort(value) {
    this.firstControlByte = true;
    this.readBuffer = value;
    if (this.codeRegister === 3) {
      this.palette[this.addressRegister & 31] = this.interpolateColor(value);
    } else {
      const address = this.addressRegister & 16383;
      this.vram[address] = value;
      const tileLine = address >> 2;
      const bitplane = address & 3;
      this.backgroundTilesShifted[tileLine] &= ~(286331153 << bitplane);
      for (let pixel = 0; pixel < 8; pixel++) {
        const mask = (1 << pixel & value) << pixel * 3 << bitplane;
        this.backgroundTilesShifted[tileLine] |= mask;
      }
    }
    this.incrementAddress();
  }
  incrementAddress() {
    this.addressRegister++;
    if (this.addressRegister > 16383) {
      this.addressRegister = 0;
    }
  }
  tilesTableAddress() {
    return (this.registers[2] & 14) << 10;
  }
  displayEnabled() {
    return testBit(6, this.registers[1]);
  }
}

var Button;
(function(Button2) {
  Button2[Button2["UP"] = 0] = "UP";
  Button2[Button2["DOWN"] = 1] = "DOWN";
  Button2[Button2["LEFT"] = 2] = "LEFT";
  Button2[Button2["RIGHT"] = 3] = "RIGHT";
  Button2[Button2["A"] = 4] = "A";
  Button2[Button2["B"] = 5] = "B";
})(Button || (Button = {}));
class Joystick {
  constructor(sms) {
    this.sms = sms;
  }
  pressedState = 255;
  port = 220;
  pauseButtons = new Set(["p", "Enter"]);
  keyMap = {
    "ArrowUp": 0,
    "ArrowDown": 1,
    "ArrowLeft": 2,
    "ArrowRight": 3,
    "z": 4,
    " ": 4,
    "x": 5
  };
  buttonStateBit = {
    [0]: 0,
    [1]: 1,
    [2]: 2,
    [3]: 3,
    [4]: 4,
    [5]: 5
  };
  press(key) {
    if (this.pauseButtons.has(key))
      this.sms.cpu.pausePressed = true;
    const button = this.keyMap[key];
    if (button === void 0)
      return;
    this.pressedState &= ~(1 << this.buttonStateBit[button]);
    this.sms.bus.out(this.port, this.pressedState);
  }
  release(key) {
    const button = this.keyMap[key];
    if (button === void 0)
      return;
    this.pressedState |= 1 << this.buttonStateBit[button];
    this.sms.bus.out(this.port, this.pressedState);
  }
}

class Debugger {
  constructor(sms) {
    this.sms = sms;
    this.updateDisassembly(1e3);
    this.state = { ...this.getCpuState(), ...this.getVdpState() };
    this.hideDebugUi();
  }
  breakpoints = new Set();
  disassembly = [];
  state;
  showDebugUi() {
    document.getElementById("disassembly").style.display = "inline";
    document.getElementById("state").style.display = "inline";
    document.getElementById("debug_controls").style.display = "inline";
  }
  hideDebugUi() {
    document.getElementById("disassembly").style.display = "none";
    document.getElementById("state").style.display = "none";
    document.getElementById("debug_controls").style.display = "none";
  }
  startDebug() {
    this.sms.running = false;
    this.showDebugUi();
    this.update();
  }
  step() {
    if (this.sms.running)
      return;
    const tstates = this.sms.cpu.step();
    this.sms.cpu.bus.vdp.update(tstates);
    this.sms.cpu.bus.sound.update(tstates);
    this.update();
  }
  continue() {
    if (this.sms.running)
      return;
    this.step();
    this.sms.run();
  }
  showMemory(event) {
    const input = event.target.value;
    const address = parseInt(input, 16);
    if (!isNaN(address)) {
      const value = toHex(this.sms.cpu.bus.read8(address));
      const text = `byte at $${toHex(address, 4)}: $${value}`;
      document.querySelector("#mem_value").innerHTML = text;
    }
  }
  update() {
    this.updateState();
    this.updateDisassembly(50);
  }
  updateDisassembly(instructionCount) {
    const updated = this.decodeNextInstructions(instructionCount);
    const pc = this.sms.cpu.pc;
    let insertIndex = this.disassembly.findIndex((x) => x.address >= pc);
    if (insertIndex === -1)
      insertIndex = this.disassembly.length;
    this.disassembly.splice(insertIndex, instructionCount, ...updated);
    const list = document.querySelector("#disassembly");
    list.innerHTML = "";
    let currentInstructionLi;
    for (const instruction of this.disassembly) {
      const address = instruction.address;
      const li = document.createElement("li");
      li.setAttribute("id", address.toString(16));
      li.addEventListener("click", () => {
        if (this.breakpoints.has(address)) {
          this.breakpoints.delete(address);
          li.classList.remove("breakpoint");
        } else {
          this.breakpoints.add(address);
          li.classList.add("breakpoint");
        }
      });
      if (this.breakpoints.has(address)) {
        li.classList.add("breakpoint");
      }
      if (address === pc) {
        li.classList.add("current");
        currentInstructionLi = li;
      }
      const text = `$${toHex(address, 4)}: ${instruction.disassembly()}`;
      li.appendChild(document.createTextNode(text));
      list.appendChild(li);
    }
    if (!this.isElementInViewport(currentInstructionLi)) {
      currentInstructionLi?.scrollIntoView(true);
    }
  }
  decodeNextInstructions(count) {
    const cpu = this.sms.cpu;
    const startTstates = cpu.tstates;
    let startPc = cpu.pc;
    const instructions = [];
    for (let i = 0; i < count; i++) {
      const currentPc = cpu.pc;
      let decoded = decode(cpu.next8(), cpu);
      const instruction = decoded.instructionConstructor(cpu, decoded.params);
      let disassembly = instruction.disassembly();
      if (disassembly.includes("NN")) {
        const nn = cpu.next16();
        disassembly = disassembly.replace("NN", `$${toHex(nn, 4)}`);
      }
      if (disassembly.includes("N")) {
        const n = cpu.next8();
        disassembly = disassembly.replace("N", `$${toHex(n, 2)}`);
      }
      if (disassembly.includes("D")) {
        const d = cpu.next8Signed();
        if (decoded.params?.idx && Object.keys(decoded.params).length > 1) {
          cpu.pc++;
          disassembly = disassembly.replace("D", `$${toHex(d, 2)}`);
        } else {
          disassembly = disassembly.replace("D", `$${toHex(cpu.pc + d, 2)}`);
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
  isElementInViewport(el) {
    const rect = el.getBoundingClientRect();
    return rect.top >= 0 && rect.left >= 0 && rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) && rect.right <= (window.innerWidth || document.documentElement.clientWidth);
  }
  updateState() {
    const list = document.querySelector("#state");
    list.innerHTML = "";
    const newCpuState = this.getCpuState();
    this.updateStateList(list, newCpuState);
    const newVdpState = this.getVdpState();
    this.updateStateList(list, newVdpState);
    this.state = { ...newCpuState, ...newVdpState };
  }
  updateStateList(stateList, newState) {
    for (let [key, value] of Object.entries(newState)) {
      const li = document.createElement("li");
      let text;
      if (typeof value !== "number")
        text = `${key}: ${value}`;
      else
        text = `${key}: $${toHex(value, 4)}`;
      li.appendChild(document.createTextNode(text));
      if (this.state[key] !== value)
        li.classList.add("changed");
      else
        li.classList.remove("changed");
      stateList.appendChild(li);
    }
  }
  getCpuState() {
    const cpu = this.sms.cpu;
    const state = {};
    for (const rp of registerPairs) {
      state[rp] = cpu[rp];
    }
    for (const [flag, value] of Object.entries(cpu.flags)) {
      state[flag] = value;
    }
    state["frame pages"] = cpu.bus.framePages;
    state["iff1"] = cpu.iff1;
    state["iff2"] = cpu.iff2;
    state["halted"] = cpu.halted;
    return state;
  }
  getVdpState() {
    const vdp = this.sms.cpu.bus.vdp;
    const state = {};
    state["address reg"] = vdp.addressRegister;
    state["code reg"] = vdp.codeRegister;
    for (const [i, value] of vdp.registers.entries()) {
      state[i] = value;
    }
    return state;
  }
}

var VideoMode;
(function(VideoMode2) {
  VideoMode2[VideoMode2["NTSC"] = 0] = "NTSC";
  VideoMode2[VideoMode2["PAL"] = 1] = "PAL";
})(VideoMode || (VideoMode = {}));
class Sms {
  static ntscTiming = {
    fps: 60,
    cpuClock: 3579545,
    tstatesPerFrame: 59736,
    scanlinesPerFrame: 262,
    tstatesPerScanline: 228
  };
  static palTiming = {
    fps: 50,
    cpuClock: 3546895,
    tstatesPerFrame: 70937,
    scanlinesPerFrame: 313,
    tstatesPerScanline: 227
  };
  cpu;
  bus;
  sound;
  vdp;
  debugger;
  joystick;
  running = false;
  frameSpeed;
  timing;
  tstatesFromLastFrame = 0;
  animationRequestId = 0;
  constructor(rom, videoMode, frameBuffer, drawFrame, audioBuffer, playAudio, sampleRate = 44100) {
    this.timing = videoMode === 0 ? Sms.ntscTiming : Sms.palTiming;
    this.frameSpeed = this.timing.fps / 60;
    this.vdp = new Vdp(videoMode, frameBuffer, drawFrame, this.timing);
    this.sound = new Sound(sampleRate, audioBuffer, playAudio, this.timing);
    this.bus = new Bus(new Cartridge(rom), this.vdp, this.sound);
    this.cpu = new Cpu(this.bus);
    this.debugger = new Debugger(this);
    this.joystick = new Joystick(this);
  }
  emulateFrame = (timestamp) => {
    if (!this.running)
      return;
    let tstatesElapsed = this.tstatesFromLastFrame;
    const tstatesThisFrame = this.timing.tstatesPerFrame * this.frameSpeed;
    while (tstatesElapsed < tstatesThisFrame) {
      if (this.debugger.breakpoints.has(this.cpu.pc)) {
        this.debugger.startDebug();
        return;
      }
      const tstates = this.cpu.step();
      tstatesElapsed += tstates;
      this.cpu.bus.sound.update(tstates);
      this.cpu.bus.vdp.update(tstates);
    }
    this.tstatesFromLastFrame = tstatesElapsed - tstatesThisFrame;
    this.updateFps(timestamp);
    this.animationRequestId = requestAnimationFrame(this.emulateFrame);
  };
  run() {
    if (this.running)
      return;
    this.running = true;
    this.debugger.hideDebugUi();
    this.animationRequestId = requestAnimationFrame(this.emulateFrame);
  }
  updateFps(frameStart) {
    const fps = 1e3 / Math.max(1e3 / this.timing.fps, performance.now() - frameStart);
    document.querySelector("#fps").innerHTML = `FPS: ${fps.toString().substring(0, 5)}`;
  }
}

const app = async () => {
  let currentRomName = "astroforce.sms";
  let currentRomData = await fetchRomData(currentRomName);
  let videoMode = VideoMode.NTSC;
  let canvas = document.querySelector("#screen");
  let widthPixels = 256;
  let heightPixels = 192;
  let canvasScale = 3;
  let ctx = canvas.getContext("2d");
  let imageData = ctx.createImageData(widthPixels, heightPixels);
  let audioCtx = new window.AudioContext();
  let sampleRate = 44100;
  let bufferSize = sampleRate;
  let audioBuffer = audioCtx.createBuffer(1, bufferSize, sampleRate);
  let soundEnabled = false;
  initUi();
  setVideoMode(videoMode);
  let sms = new Sms(currentRomData, videoMode, imageData.data, drawFrame, audioBuffer.getChannelData(0), playAudio, sampleRate);
  function playAudio() {
    if (!soundEnabled)
      return;
    let audioSource2 = audioCtx.createBufferSource();
    audioSource2.buffer = audioBuffer;
    audioSource2.connect(audioCtx.destination);
    audioSource2.start(0);
  }
  function drawFrame() {
    ctx.putImageData(imageData, 0, 0);
    ctx.drawImage(ctx.canvas, 0, 0, ctx.canvas.width * canvasScale, ctx.canvas.height * canvasScale);
  }
  function setVideoMode(mode) {
    videoMode = mode;
    document.getElementById("toggle_video_mode").innerText = `mode: ${VideoMode[videoMode]}`;
  }
  function initUi() {
    initButtons();
    initScreen();
    initKeyListeners();
    document.getElementById("rom_name").innerText = `ROM: ${currentRomName}`;
  }
  function initScreen() {
    canvas.width = widthPixels * canvasScale;
    canvas.height = heightPixels * canvasScale;
    ctx.imageSmoothingEnabled = false;
    imageData = ctx.createImageData(widthPixels, heightPixels);
    imageData.data.fill(255);
    drawFrame();
    canvas.addEventListener("click", (e) => {
      const count = e.detail;
      if (count === 2) {
        if (document.fullscreenElement === null) {
          canvas.requestFullscreen();
        } else {
          document.exitFullscreen();
        }
      }
    });
  }
  function initKeyListeners() {
    document.addEventListener("keydown", (e) => {
      sms.joystick.press(e.key);
    });
    document.addEventListener("keyup", (e) => {
      sms.joystick.release(e.key);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
      }
    });
  }
  function initButtons() {
    document.querySelector("#toggle_video_mode")?.addEventListener("click", () => {
      toggleMode();
    });
    document.querySelector("#start")?.addEventListener("click", () => {
      sms.run();
    });
    document.querySelector("#reset")?.addEventListener("click", () => {
      loadRom(currentRomData, currentRomName);
    });
    document.querySelector("#toggle_sound")?.addEventListener("click", () => {
      toggleSound();
    });
    document.querySelector("#browse_rom")?.addEventListener("click", () => {
      browseRom();
    });
    document.querySelector("#debug")?.addEventListener("click", () => {
      sms.debugger.startDebug();
    });
    document.querySelector("#step")?.addEventListener("click", () => {
      sms.debugger.step();
    });
    document.querySelector("#continue")?.addEventListener("click", () => {
      sms.debugger.continue();
    });
    document.querySelector("#show_mem")?.addEventListener("change", (e) => {
      sms.debugger.showMemory(e);
    });
    document.querySelectorAll("button").forEach((item) => {
      item.addEventListener("focus", () => {
        item.blur();
      });
    });
  }
  function toggleMode() {
    setVideoMode(videoMode === VideoMode.NTSC ? VideoMode.PAL : VideoMode.NTSC);
    document.getElementById("toggle_video_mode").innerText = `mode: ${VideoMode[videoMode]}`;
    loadRom(currentRomData, currentRomName);
  }
  function toggleSound() {
    soundEnabled = !soundEnabled;
    const toggleSound2 = document.querySelector("#toggle_sound");
    if (soundEnabled)
      toggleSound2?.classList.remove("red");
    else
      toggleSound2?.classList.add("red");
  }
  function loadRom(rom, name) {
    if (sms.running) {
      sms.running = false;
      cancelAnimationFrame(sms.animationRequestId);
    }
    sms = new Sms(rom, videoMode, imageData.data, drawFrame, audioBuffer.getChannelData(0), playAudio, sampleRate);
    document.getElementById("rom_name").innerText = `ROM: ${name}`;
    currentRomData = rom;
    currentRomName = name;
    sms.run();
  }
  function browseRom() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".sms";
    input.addEventListener("change", async () => {
      if (input.files && input.files[0]) {
        const file = input.files[0];
        const buffer = await file.arrayBuffer();
        setVideoMode(VideoMode.NTSC);
        loadRom(new Uint8Array(buffer), file.name);
      }
    });
    input.dispatchEvent(new MouseEvent("click"));
  }
  async function fetchRomData(name) {
    const url = `https://marko-tisma.github.io/sms-emu/rom/${name}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`File ${url} doesn't exist`);
    }
    const blob = await response.blob();
    return new Uint8Array(await blob.arrayBuffer());
  }
};
app();
