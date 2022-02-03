import { parity } from "./alu";
import { Sms } from "./ui/sms";
import { testBit } from "./util";

export class Sound {

    samplesPerFrame: number;
    tstatesPerSample: number;
    clocksPerSample: number;

    volumeRegisters = [0xf, 0xf, 0xf, 0xf];
    volumeTable = new Array(16);
    maxVolume = 0.05;

    // First 3 items are tone registers, last item is the noise register
    frequencyRegisters = [1, 1, 1, 1];
    frequencyCounters = [0, 0, 0, 0];
    frequencyOutputs = [1, 1, 1, 1];
    shiftRegister = 0x8000;

    latchedChannel = 0;
    latchedVolume = false;

    bufferIndex = 0;

    framesToQueue = 16;
    tstatesSinceLastSample = 0;

    constructor(
        public audioBuffer: Float32Array,
        public playAudio: Function,
        public sampleRate: number
    ) {
        this.samplesPerFrame = this.sampleRate / 60;
        this.tstatesPerSample = Sms.TSTATES_PER_FRAME / this.samplesPerFrame;
        this.clocksPerSample = this.tstatesPerSample / 16;
        this.initVolumeTable();
    }

    initVolumeTable() {
        const twoDb = 0.8;
        let currVolume = this.maxVolume;
        for (let i = 0; i < 15; i++) {
            this.volumeTable[i] = currVolume;
            currVolume *= twoDb;
        }
        this.volumeTable[15] = 0;
    }

    update(tstates: number) {
        this.tstatesSinceLastSample += tstates;
        if (this.tstatesSinceLastSample <= this.tstatesPerSample) return; 

        // New sample
        this.tstatesSinceLastSample -= this.tstatesPerSample;

        let output = 0;
        for (let i = 0; i < 3; i++) {
            // Tone registers
            output += this.frequencyOutputs[i] * (this.volumeTable[this.volumeRegisters[i]]);
        }
        // Noise register
        output += ((this.shiftRegister & 1) * this.volumeTable[this.volumeRegisters[3]]);
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
                }
                else {
                    this.frequencyOutputs[i] = 1;
                }
            }
        }

        this.frequencyCounters[3] -= this.clocksPerSample;
        if (this.frequencyCounters[3] <= 0) {
            this.frequencyOutputs[3] = -this.frequencyOutputs[3];
            if ((this.frequencyRegisters[3] & 3) === 3) {
                this.frequencyCounters[3] += this.frequencyRegisters[2];
            }
            else {
                this.frequencyCounters[3] += 0x10 << (this.frequencyRegisters[3] & 3);
            }

            if (this.frequencyOutputs[3] === 1) {
                let feedback = 0;
                if (testBit(2, this.frequencyRegisters[3])) {
                    feedback = +parity(this.shiftRegister & 0x9);
                    this.shiftRegister = (this.shiftRegister >> 1) | (feedback << 15);
                }
                else {
                    this.shiftRegister >>= 1;
                    if (this.shiftRegister === 0) this.shiftRegister = 0x8000;
                }
            }
        }
    }

    write(value: number) {
        if (testBit(7, value)) {
            // Latch write
            this.latchedChannel = (value >> 5) & 3;
            if (testBit(4, value)) {
                this.volumeRegisters[this.latchedChannel] = value & 0xf;
                this.latchedVolume = true;
            }
            else {
                if (this.latchedChannel < 3)
                    this.frequencyRegisters[this.latchedChannel] = (this.frequencyRegisters[this.latchedChannel] & 0x3f0) | (value & 0xf);
                else {
                    this.shiftRegister = 0x8000;
                    this.frequencyRegisters[3] = value & 0xf;
                }
                this.latchedVolume = false;
            }
        }
        else {
            // Data write
            if (this.latchedVolume) {
                this.volumeRegisters[this.latchedChannel] = value & 0xf;
            }
            else {
                if (this.latchedChannel < 3) {
                    this.frequencyRegisters[this.latchedChannel] = (this.frequencyRegisters[this.latchedChannel] & 0xf) | ((value & 0x3f) << 4);
                }
                else {
                    this.shiftRegister = 0x8000;
                    this.frequencyRegisters[3] = value & 0xf;
                }
            }
        }
    }
}