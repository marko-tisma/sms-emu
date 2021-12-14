import { Bus } from "../bus";
import { Cartridge } from "../cartridge";
import { Cpu } from "../cpu";
import { Debugger } from "./debugger";
import { Renderer } from "./renderer";

export class Sms {

  static cpuClock = 3579540;
  static tstatesPerFrame = Math.floor(Sms.cpuClock / 60);

  cpu: Cpu;
  renderer: Renderer;
  debugger: Debugger;

  animationRequest = 0;

  constructor(rom: Uint8Array) {
      this.cpu = new Cpu(new Bus(new Cartridge(rom)));
      this.renderer = new Renderer(this.cpu.bus.vdp);
      this.debugger = new Debugger(this);
    //   this.debugger.breakpoints.add(0x279f);
    //   this.debugger.breakpoints.add(0x2908); // Print char
      // this.debugger.breakpoints.add(0x2b5b); // TestInRAM
      this.debugger.breakpoints.add(0x2400); // Start test
      this.debugger.breakpoints.add(0x2448); // TestLoop
    //   this.debugger.breakpoints.add(0x2c33); // InitialiseCRC
    //   this.debugger.breakpoints.add(0x2445); // InitialiseCRC
    //   this.debugger.breakpoints.add(0x2447); // TestLoop
      this.debugger.breakpoints.add(0x245b); // call nz, TestInRam 
  }

  runFrame = (timestamp: DOMHighResTimeStamp) => {
      let tstatesElapsed = 0;
      while (tstatesElapsed < Sms.tstatesPerFrame) {
          if (this.debugger.breakpoints.has(this.cpu.pc)) {
              cancelAnimationFrame(this.animationRequest);
              this.debugger.update();
              return;
          }
          const tstates = this.cpu.run(this.cpu.next8());
          tstatesElapsed += tstates;
          this.renderer.update(tstates);
      }
        this.debugger.updateState();
      console.log(`elapsed: ${performance.now() - timestamp}`);
      // requestAnimationFrame(() => this.runFrame);
      this.animationRequest = requestAnimationFrame(this.runFrame);
  }
}