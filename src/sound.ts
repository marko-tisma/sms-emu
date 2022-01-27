import { parity } from "./alu";
import { Sms } from "./ui/sms";
import { testBit } from "./util";

export class Sound {

    sampleRate = 44100;
    samplesPerFrame = this.sampleRate / 60;
    tstatesPerSample = Sms.TSTATES_PER_FRAME / this.samplesPerFrame;
    clocksPerSample = this.tstatesPerSample / 16;
    bufferSize = this.sampleRate;

    volumeRegisters = [0xf, 0xf, 0xf, 0xf];
    volumeTable = [25, 20, 16, 13, 10, 8, 6, 5, 4, 3, 3, 2, 2, 1, 1, 0]

    // First 3 items are tone registers, last item is the noise register
    frequencyRegisters = [1, 1, 1, 1];
    frequencyCounters = [0, 0, 0, 0];
    frequencyOutputs = [1, 1, 1, 1];
    // Shift register
    lfsr = 0x8000;

    latchedChannel = 0;
    latchedVolume = false;

    audioBuffer: AudioBuffer;
    bufferData: Float32Array;
    bufferIndex = 0;

    tstatesSinceLastSample = 0;
    framesToQueue = 16;

    constructor(private audioCtx: AudioContext) {
        this.audioBuffer = audioCtx.createBuffer(1, this.bufferSize, this.sampleRate);
        this.bufferData = this.audioBuffer.getChannelData(0);
    }

    playAudio() {
        const source = this.audioCtx.createBufferSource();
        source.buffer = this.audioBuffer;
        source.connect(this.audioCtx.destination);
        source.start(0);
    }

    update(tstates: number) {
        this.tstatesSinceLastSample += tstates;
        if (this.tstatesSinceLastSample < this.tstatesPerSample) return;

        // New sample
        this.tstatesSinceLastSample -= this.tstatesPerSample;

        let output = 0;
        for (let i = 0; i < 3; i++) {
            // Tone registers
            output += this.frequencyOutputs[i] * (this.volumeTable[this.volumeRegisters[i]]);
        }
        // Noise register
        output += ((this.lfsr & 1) * this.volumeTable[this.volumeRegisters[3]]) << 1;
        output /= 0x200;
        this.bufferData[this.bufferIndex++] = output;

		if (this.bufferIndex === this.samplesPerFrame * this.framesToQueue) {
			this.playAudio();
		}
        if (this.bufferIndex >= this.bufferSize) {
            this.bufferIndex -= this.bufferSize;
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
                    feedback = +parity(this.lfsr & 0x9);
                    this.lfsr = (this.lfsr >> 1) | (feedback << 15);
                }
                else {
                    this.lfsr >>= 1;
                    if (this.lfsr === 0) this.lfsr = 0x8000;
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
                    this.lfsr = 0x8000;
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
                    this.lfsr = 0x8000;
                    this.frequencyRegisters[3] = value & 0xf;
                }
            }
        }
    }
}