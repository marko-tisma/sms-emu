export class Register {

    private data: ArrayBuffer;
    private view: DataView;

    constructor(private bytes: 1 | 2) {
        this.data = new ArrayBuffer(bytes);
        this.view = new DataView(this.data);
    }

    get value(): number {
       return this.bytes == 1 ? this.view.getUint8(0) : this.view.getUint16(0); 
    }

    set value(value: number) {
        this.bytes == 1 ? this.view.setUint8(0, value) : this.view.setUint16(0, value);
    }

}