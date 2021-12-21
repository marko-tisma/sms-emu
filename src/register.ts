export class Register {

    private data = 0;

    constructor(private bytes: 1 | 2) { }

    get value(): number {
       return this.bytes === 1 ? this.data & 0xff : this.data & 0xffff; 
    }

    set value(value: number) {
        this.bytes === 1 ? this.data = value & 0xff : this.data = value & 0xffff;
    }

}