import { Bus } from "../src/bus";
import { Cartridge } from "../src/cartridge";
import { Cpu, DecodingMode } from "../src/cpu";

declare const process: {
    argv: string[],
    hrtime: { bigint: () => bigint }
};

type BenchmarkResult = {
    mode: DecodingMode,
    samples: number[],
    checksum: number,
    tstates: number
};

const DEFAULT_STEPS = 2_000_000;
const DEFAULT_SAMPLES = 9;
const DEFAULT_WARMUP_STEPS = 100_000;

const TEST_PROGRAM = new Uint8Array([
    0x00,                         // nop
    0x3e, 0x12,                   // ld a, n
    0x06, 0x34,                   // ld b, n
    0x0e, 0x56,                   // ld c, n
    0x21, 0x00, 0xc0,             // ld hl, nn
    0x11, 0x10, 0xc0,             // ld de, nn
    0x01, 0x20, 0x00,             // ld bc, nn
    0x77,                         // ld (hl), a
    0x7e,                         // ld a, (hl)
    0x80,                         // add a, b
    0x88,                         // adc a, b
    0xa1,                         // and c
    0xae,                         // xor (hl)
    0xcb, 0x11,                   // rl c
    0xcb, 0x7e,                   // bit 7, (hl)
    0xed, 0x4a,                   // adc hl, bc
    0xed, 0x5a,                   // adc hl, de
    0xdd, 0x21, 0x00, 0xc0,       // ld ix, nn
    0xdd, 0x36, 0x02, 0xaa,       // ld (ix + d), n
    0xdd, 0x7e, 0x02,             // ld a, (ix + d)
    0xdd, 0xcb, 0x02, 0x46,       // bit 0, (ix + d)
    0xfd, 0x21, 0x00, 0xc0,       // ld iy, nn
    0xfd, 0x36, 0x04, 0x55,       // ld (iy + d), n
    0xfd, 0x7e, 0x04,             // ld a, (iy + d)
    0xfd, 0xcb, 0x04, 0x86,       // res 0, (iy + d)
    0x23,                         // inc hl
    0x2b,                         // dec hl
    0x04,                         // inc b
    0x05                          // dec b
]);

const createBus = (): Bus => {
    const rom = new Uint8Array(Bus.PAGE_SIZE);
    for (let offset = 0; offset < rom.length; offset += TEST_PROGRAM.length) {
        rom.set(TEST_PROGRAM.slice(0, Math.min(TEST_PROGRAM.length, rom.length - offset)), offset);
    }

    const vdp = {
        requestedInterrupt: false,
        getVCounter: () => 0
    };
    const sound = { write: (_value: number) => undefined };

    return new Bus(new Cartridge(rom), vdp as any, sound as any);
}

const createCpu = (mode: DecodingMode): Cpu => {
    const cpu = new Cpu(createBus(), mode);
    cpu.sp = 0xdff0;
    cpu.hl = 0xc000;
    cpu.ix = 0xc000;
    cpu.iy = 0xc000;
    return cpu;
}

const runSteps = (cpu: Cpu, steps: number): number => {
    let tstates = 0;
    for (let step = 0; step < steps; step++) {
        tstates += cpu.step();
        if (cpu.pc >= TEST_PROGRAM.length) cpu.pc = 0;
    }
    return tstates;
}

const checksum = (cpu: Cpu): number => (
    cpu.a ^ cpu.b ^ cpu.c ^ cpu.d ^ cpu.e ^
    (cpu.hl & 0xff) ^ (cpu.pc & 0xff) ^ cpu.bus.ram[0] ^ cpu.bus.ram[2] ^ cpu.bus.ram[4]
);

const timeSteps = (mode: DecodingMode, steps: number): { milliseconds: number, checksum: number, tstates: number } => {
    const cpu = createCpu(mode);
    const start = process.hrtime.bigint();
    const tstates = runSteps(cpu, steps);
    const end = process.hrtime.bigint();
    return {
        milliseconds: Number(end - start) / 1_000_000,
        checksum: checksum(cpu),
        tstates
    };
}

const benchmarkMode = (mode: DecodingMode, steps: number, samples: number, warmupSteps: number): BenchmarkResult => {
    runSteps(createCpu(mode), warmupSteps);

    const sampleTimes = [];
    let resultChecksum = 0;
    let tstates = 0;
    for (let sample = 0; sample < samples; sample++) {
        const result = timeSteps(mode, steps);
        sampleTimes.push(result.milliseconds);
        resultChecksum ^= result.checksum;
        tstates = result.tstates;
    }
    return { mode, samples: sampleTimes, checksum: resultChecksum, tstates };
}

const parseArg = (name: string, fallback: number): number => {
    const prefix = `--${name}=`;
    const arg = process.argv.find(value => value.startsWith(prefix));
    if (!arg) return fallback;

    const value = Number(arg.slice(prefix.length));
    if (!Number.isFinite(value) || value <= 0) return fallback;
    return Math.floor(value);
}

const format = (value: number): string => value.toFixed(2);

const median = (samples: number[]): number => {
    const sorted = [...samples].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

const summarize = (result: BenchmarkResult, steps: number) => {
    const min = Math.min(...result.samples);
    const max = Math.max(...result.samples);
    const med = median(result.samples);
    const stepsPerSecond = steps / (med / 1000);

    return {
        mode: DecodingMode[result.mode],
        medianMs: med,
        minMs: min,
        maxMs: max,
        stepsPerSecond,
        tstates: result.tstates,
        checksum: result.checksum
    };
}

const main = () => {
    const steps = parseArg("steps", DEFAULT_STEPS);
    const samples = parseArg("samples", DEFAULT_SAMPLES);
    const warmupSteps = parseArg("warmup", DEFAULT_WARMUP_STEPS);

    const table = benchmarkMode(DecodingMode.TABLE, steps, samples, warmupSteps);
    const decode = benchmarkMode(DecodingMode.DECODE, steps, samples, warmupSteps);
    const tableSummary = summarize(table, steps);
    const decodeSummary = summarize(decode, steps);
    const speedup = decodeSummary.medianMs / tableSummary.medianMs;

    console.log(`Synthetic decoding benchmark (${steps.toLocaleString()} CPU steps, ${samples} samples)`);
    console.log("Mode    median ms   min ms   max ms   steps/s       tstates    checksum");
    for (const row of [tableSummary, decodeSummary]) {
        console.log(
            `${row.mode.padEnd(7)} ${format(row.medianMs).padStart(9)} ` +
            `${format(row.minMs).padStart(8)} ${format(row.maxMs).padStart(8)} ` +
            `${Math.round(row.stepsPerSecond).toLocaleString().padStart(11)} ` +
            `${row.tstates.toLocaleString().padStart(10)} ${row.checksum.toString(16).padStart(8, "0")}`
        );
    }
    console.log(`TABLE speedup vs DECODE: ${speedup.toFixed(2)}x`);
}

main();
