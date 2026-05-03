/**
 * SuperInstance FLUX VM — Pure JavaScript Reference Implementation
 * FLUX ISA v3.0 — for browser-based bytecode execution
 * 
 * Usage:
 *   const vm = new FluxVM();
 *   vm.load(uint8array);
 *   vm.run();
 *   console.log(vm.regs());
 */

// Format A: 1 byte opcode
// Format B: opcode(1) + Rd(1) + Rs(1)  
// Format C: opcode(1) + Rd(1) + Ra(1) + Rb(1)
// Format D: opcode(1) + Rd(1) + imm_lo(1) + imm_hi(1)
// Format E: opcode(1) + Rd(1) + Rbase(1) + off_lo(1) + off_hi(1)
// Format G: opcode(1) + length(1) + payload(N)

class FluxVM {
  constructor(memorySize = 65536) {
    this.memory = new Uint8Array(memorySize);
    this.memorySize = memorySize;
    this.gp = new Int32Array(16);     // R0-R15
    this.fp = new Float32Array(16);    // F0-F15
    this.vr = [];                      // V0-V15: 16 x 256-byte binary
    for (let i = 0; i < 16; i++) this.vr.push(new Uint8Array(256));
    
    this.pc = 0;
    this.sp = memorySize;
    this.fp_reg = 0;
    this.flags = 0; // Z:0x1, S:0x2, C:0x4, V:0x8
    
    this.state = 'halted';
    this.cyclesUsed = 0;
    this.instructionCount = 0;
    this.cycleBudget = Infinity;
  }
  
  load(bytecode) {
    if (bytecode instanceof Uint8Array) {
      this.memory.set(bytecode);
    } else {
      // ArrayBuffer or other
      const buf = bytecode instanceof ArrayBuffer ? bytecode : bytecode.buffer;
      this.memory.set(new Uint8Array(buf));
    }
    this.pc = 0;
    this.state = 'running';
  }
  
  run(maxCycles = null) {
    if (maxCycles) this.cycleBudget = maxCycles;
    this.state = 'running';
    while (this.state === 'running' && this.cyclesUsed < this.cycleBudget) {
      this.step();
    }
    return this.state;
  }
  
  step() {
    if (this.state !== 'running') return;
    if (this.pc < 0 || this.pc >= this.memorySize) {
      this.state = 'panicked';
      return;
    }
    
    const opcode = this.memory[this.pc];
    this.cyclesUsed++;
    this.instructionCount++;
    
    this.executeOpcode(opcode);
  }
  
  executeOpcode(opcode) {
    switch (opcode) {
      // Format A: 1 byte
      case 0x00: this.opHalt(); break;
      case 0x01: this.opNop(); break;
      case 0x02: this.opRet(); break;
      case 0x03: this.opJump(); break;
      case 0x04: this.opJumpIf(); break;
      case 0x05: this.opJumpIfNot(); break;
      case 0x06: this.opCall(); break;
      case 0x07: this.opCallIndirect(); break;
      case 0x08: this.opYield(); break;
      case 0x09: this.opPanic(); break;
      case 0x0A: this.opUnreachable(); break;
      // Format B: 3 bytes
      case 0x10: this.opPush(); break;
      case 0x11: this.opPop(); break;
      case 0x12: this.opDup(); break;
      case 0x13: this.opSwap(); break;
      case 0x20: this.opIMov(); break;
      case 0x40: this.opFMov(); break;
      // Format C: 4 bytes
      case 0x21: this.opIAdd(); break;
      case 0x22: this.opISub(); break;
      case 0x23: this.opIMul(); break;
      case 0x24: this.opIDiv(); break;
      case 0x25: this.opIMod(); break;
      case 0x26: this.opINeg(); break;
      case 0x27: this.opIAbs(); break;
      case 0x2A: this.opIMin(); break;
      case 0x2B: this.opIMax(); break;
      case 0x2C: this.opIAnd(); break;
      case 0x2D: this.opIOr(); break;
      case 0x2E: this.opIXor(); break;
      case 0x2F: this.opIShl(); break;
      case 0x30: this.opIShr(); break;
      case 0x31: this.opINot(); break;
      case 0x32: this.opICmpEq(); break;
      case 0x33: this.opICmpNe(); break;
      case 0x34: this.opICmpLt(); break;
      case 0x35: this.opICmpLe(); break;
      case 0x36: this.opICmpGt(); break;
      case 0x37: this.opICmpGe(); break;
      case 0x41: this.opFAdd(); break;
      case 0x42: this.opFSub(); break;
      case 0x43: this.opFMul(); break;
      case 0x44: this.opFDiv(); break;
      case 0x48: this.opFSqrt(); break;
      case 0x54: this.opFCmpEq(); break;
      case 0x56: this.opFCmpLt(); break;
      case 0x60: this.opIToF(); break;
      case 0x61: this.opFToI(); break;
      case 0x62: this.opBToI(); break;
      case 0x63: this.opIToB(); break;
      case 0xA0: this.opBAnd(); break;
      case 0xA1: this.opBOr(); break;
      case 0xA2: this.opBXor(); break;
      case 0xB2: this.opVAdd(); break;
      case 0xB3: this.opVMul(); break;
      case 0xB4: this.opVDot(); break;
      // Format D: 4 bytes
      case 0x28: this.opIInc(); break;
      case 0x29: this.opIDec(); break;
      case 0x79: this.opStackAlloc(); break;
      // Format E: 5 bytes
      case 0x70: this.opLoad8(); break;
      case 0x71: this.opLoad16(); break;
      case 0x72: this.opLoad32(); break;
      case 0x74: this.opStore8(); break;
      case 0x75: this.opStore16(); break;
      case 0x76: this.opStore32(); break;
      case 0x78: this.opLoadAddr(); break;
      case 0xB0: this.opVLoad(); break;
      case 0xB1: this.opVStore(); break;
      // Format G: variable
      case 0x80: this.opASend(); break;
      case 0x81: this.opARecv(); break;
      case 0x82: this.opAAsk(); break;
      case 0x83: this.opATell(); break;
      case 0x84: this.opADelegate(); break;
      case 0x85: this.opABroadcast(); break;
      case 0x86: this.opASubscribe(); break;
      case 0x87: this.opAWait(); break;
      case 0x88: this.opATrust(); break;
      case 0x89: this.opAVerify(); break;
      default:
        this.state = 'panicked';
        throw new Error(`Unknown opcode: 0x${opcode.toString(16)}`);
    }
  }
  
  setFlagsZ(v) { this.flags = (v === 0) ? (this.flags | 1) : (this.flags & ~1); }
  setFlagsS(v) { this.flags = (v < 0) ? (this.flags | 2) : (this.flags & ~2); }
  setFlagsC(v) { this.flags = v ? (this.flags | 4) : (this.flags & ~4); }
  setFlagsV(v) { this.flags = v ? (this.flags | 8) : (this.flags & ~8); }
  
  // Format A opcodes
  opHalt() { this.pc++; this.state = 'halted'; }
  opNop() { this.pc++; }
  opRet() { 
    // Pop return address from stack
    if (this.sp >= this.memorySize) throw new Error('Stack underflow');
    const addr = (this.memory[this.sp] | (this.memory[this.sp+1] << 8) | 
                  (this.memory[this.sp+2] << 16) | (this.memory[this.sp+3] << 24));
    this.sp += 4;
    this.pc = addr;
  }
  opYield() { this.pc++; this.state = 'yielded'; }
  opPanic() { this.pc++; this.state = 'panicked'; throw new Error('Panic'); }
  opUnreachable() { this.pc++; this.state = 'panicked'; throw new Error('Unreachable'); }
  
  // Format B opcodes
  opPush() {
    if (this.pc + 2 >= this.memorySize) { this.state = 'panicked'; return; }
    const Rd = this.memory[this.pc + 1];
    const Rs = this.memory[this.pc + 2];
    this.memory[this.sp++] = this.gp[Rs] & 0xFF;
    this.memory[this.sp++] = (this.gp[Rs] >> 8) & 0xFF;
    this.memory[this.sp++] = (this.gp[Rs] >> 16) & 0xFF;
    this.memory[this.sp++] = (this.gp[Rs] >> 24) & 0xFF;
    this.pc += 3;
  }
  opPop() {
    if (this.pc + 2 >= this.memorySize) { this.state = 'panicked'; return; }
    if (this.sp < 4) throw new Error('Stack underflow');
    const Rd = this.memory[this.pc + 1];
    this.sp -= 4;
    this.gp[Rd] = (this.memory[this.sp] | (this.memory[this.sp+1] << 8) | 
                   (this.memory[this.sp+2] << 16) | (this.memory[this.sp+3] << 24));
    // Sign extend
    this.gp[Rd] = (this.gp[Rd] << 24) >> 24;
    this.pc += 3;
  }
  opDup() {
    if (this.pc + 2 >= this.memorySize) { this.state = 'panicked'; return; }
    const Rd = this.memory[this.pc + 1];
    const Rs = this.memory[this.pc + 2];
    this.gp[Rd] = this.gp[Rs];
    this.pc += 3;
  }
  opSwap() {
    if (this.pc + 2 >= this.memorySize) { this.state = 'panicked'; return; }
    const Ra = this.memory[this.pc + 1];
    const Rb = this.memory[this.pc + 2];
    [this.gp[Ra], this.gp[Rb]] = [this.gp[Rb], this.gp[Ra]];
    this.pc += 3;
  }
  opIMov() {
    if (this.pc + 2 >= this.memorySize) { this.state = 'panicked'; return; }
    const Rd = this.memory[this.pc + 1];
    const Rs = this.memory[this.pc + 2];
    this.gp[Rd] = this.gp[Rs];
    this.pc += 3;
  }
  opFMov() {
    if (this.pc + 2 >= this.memorySize) { this.state = 'panicked'; return; }
    const Rd = this.memory[this.pc + 1];
    const Rs = this.memory[this.pc + 2];
    this.fp[Rd] = this.fp[Rs];
    this.pc += 3;
  }
  
  // Format C opcodes
  _readC() {
    if (this.pc + 3 >= this.memorySize) { this.state = 'panicked'; return [0,0,0,0]; }
    const opcode = this.memory[this.pc];
    const Rd = this.memory[this.pc + 1];
    const Ra = this.memory[this.pc + 2];
    const Rb = this.memory[this.pc + 3];
    this.pc += 4;
    return [Rd, Ra, Rb];
  }
  opIAdd() { const [Rd,Ra,Rb] = this._readC(); this.gp[Rd] = this.gp[Ra] + this.gp[Rb]; this.setFlagsZ(this.gp[Rd]); this.setFlagsS(this.gp[Rd]); }
  opISub() { const [Rd,Ra,Rb] = this._readC(); this.gp[Rd] = this.gp[Ra] - this.gp[Rb]; this.setFlagsZ(this.gp[Rd]); this.setFlagsS(this.gp[Rd]); }
  opIMul() { const [Rd,Ra,Rb] = this._readC(); this.gp[Rd] = this.gp[Ra] * this.gp[Rb]; this.setFlagsZ(this.gp[Rd]); this.setFlagsS(this.gp[Rd]); }
  opIDiv() { const [Rd,Ra,Rb] = this._readC(); if (this.gp[Rb] === 0) { this.state = 'panicked'; throw new Error('Division by zero'); } this.gp[Rd] = Math.trunc(this.gp[Ra] / this.gp[Rb]); this.setFlagsZ(this.gp[Rd]); }
  opIMod() { const [Rd,Ra,Rb] = this._readC(); this.gp[Rd] = this.gp[Ra] % this.gp[Rb]; this.setFlagsZ(this.gp[Rd]); }
  opINeg() { const [Rd,Ra,Rb] = this._readC(); this.gp[Rd] = -this.gp[Ra]; this.setFlagsZ(this.gp[Rd]); this.setFlagsS(this.gp[Rd]); }
  opIAbs() { const [Rd,Ra,Rb] = this._readC(); this.gp[Rd] = Math.abs(this.gp[Ra]); this.setFlagsZ(this.gp[Rd]); }
  opIMin() { const [Rd,Ra,Rb] = this._readC(); this.gp[Rd] = Math.min(this.gp[Ra], this.gp[Rb]); this.setFlagsZ(this.gp[Rd]); }
  opIMax() { const [Rd,Ra,Rb] = this._readC(); this.gp[Rd] = Math.max(this.gp[Ra], this.gp[Rb]); this.setFlagsZ(this.gp[Rd]); }
  opIAnd() { const [Rd,Ra,Rb] = this._readC(); this.gp[Rd] = this.gp[Ra] & this.gp[Rb]; this.setFlagsZ(this.gp[Rd]); }
  opIOr()  { const [Rd,Ra,Rb] = this._readC(); this.gp[Rd] = this.gp[Ra] | this.gp[Rb]; this.setFlagsZ(this.gp[Rd]); }
  opIXor() { const [Rd,Ra,Rb] = this._readC(); this.gp[Rd] = this.gp[Ra] ^ this.gp[Rb]; this.setFlagsZ(this.gp[Rd]); }
  opIShl() { const [Rd,Ra,Rb] = this._readC(); this.gp[Rd] = this.gp[Ra] << (this.gp[Rb] & 31); this.setFlagsZ(this.gp[Rd]); }
  opIShr() { const [Rd,Ra,Rb] = this._readC(); this.gp[Rd] = this.gp[Ra] >> (this.gp[Rb] & 31); this.setFlagsZ(this.gp[Rd]); }
  opINot() { const [Rd,Ra,Rb] = this._readC(); this.gp[Rd] = ~this.gp[Ra]; this.setFlagsZ(this.gp[Rd]); }
  opICmpEq() { const [Rd,Ra,Rb] = this._readC(); this.gp[Rd] = this.gp[Ra] === this.gp[Rb] ? 1 : 0; this.setFlagsZ(this.gp[Rd]); }
  opICmpNe() { const [Rd,Ra,Rb] = this._readC(); this.gp[Rd] = this.gp[Ra] !== this.gp[Rb] ? 1 : 0; this.setFlagsZ(this.gp[Rd]); }
  opICmpLt() { const [Rd,Ra,Rb] = this._readC(); this.gp[Rd] = this.gp[Ra] < this.gp[Rb] ? 1 : 0; this.setFlagsZ(this.gp[Rd]); }
  opICmpLe() { const [Rd,Ra,Rb] = this._readC(); this.gp[Rd] = this.gp[Ra] <= this.gp[Rb] ? 1 : 0; this.setFlagsZ(this.gp[Rd]); }
  opICmpGt() { const [Rd,Ra,Rb] = this._readC(); this.gp[Rd] = this.gp[Ra] > this.gp[Rb] ? 1 : 0; this.setFlagsZ(this.gp[Rd]); }
  opICmpGe() { const [Rd,Ra,Rb] = this._readC(); this.gp[Rd] = this.gp[Ra] >= this.gp[Rb] ? 1 : 0; this.setFlagsZ(this.gp[Rd]); }
  opFAdd() { const [Rd,Ra,Rb] = this._readC(); this.fp[Rd] = this.fp[Ra] + this.fp[Rb]; this.setFlagsZ(this.fp[Rd]); }
  opFSub() { const [Rd,Ra,Rb] = this._readC(); this.fp[Rd] = this.fp[Ra] - this.fp[Rb]; this.setFlagsZ(this.fp[Rd]); }
  opFMul() { const [Rd,Ra,Rb] = this._readC(); this.fp[Rd] = this.fp[Ra] * this.fp[Rb]; this.setFlagsZ(this.fp[Rd]); }
  opFDiv() { const [Rd,Ra,Rb] = this._readC(); this.fp[Rd] = this.fp[Ra] / this.fp[Rb]; this.setFlagsZ(this.fp[Rd]); }
  opFSqrt() { const [Rd,Ra,Rb] = this._readC(); this.fp[Rd] = Math.sqrt(this.fp[Ra]); this.setFlagsZ(this.fp[Rd]); }
  opFCmpEq() { const [Rd,Ra,Rb] = this._readC(); this.gp[Rd] = this.fp[Ra] === this.fp[Rb] ? 1 : 0; }
  opFCmpLt() { const [Rd,Ra,Rb] = this._readC(); this.gp[Rd] = this.fp[Ra] < this.fp[Rb] ? 1 : 0; }
  opIToF() { const [Rd,Ra,Rb] = this._readC(); this.fp[Rd] = this.gp[Ra]; }
  opFToI() { const [Rd,Ra,Rb] = this._readC(); this.gp[Rd] = Math.trunc(this.fp[Ra]); }
  opBToI() { const [Rd,Ra,Rb] = this._readC(); this.gp[Rd] = this.gp[Ra] !== 0 ? 1 : 0; }
  opIToB() { const [Rd,Ra,Rb] = this._readC(); this.gp[Rd] = this.gp[Ra] ? 1 : 0; }
  opBAnd() { const [Rd,Ra,Rb] = this._readC(); this.gp[Rd] = this.gp[Ra] & this.gp[Rb]; this.setFlagsZ(this.gp[Rd]); }
  opBOr() { const [Rd,Ra,Rb] = this._readC(); this.gp[Rd] = this.gp[Ra] | this.gp[Rb]; this.setFlagsZ(this.gp[Rd]); }
  opBXor() { const [Rd,Ra,Rb] = this._readC(); this.gp[Rd] = this.gp[Ra] ^ this.gp[Rb]; this.setFlagsZ(this.gp[Rd]); }
  opVAdd() { const [Rd,Ra,Rb] = this._readC(); for (let i = 0; i < 256; i++) this.vr[Rd][i] = this.vr[Ra][i] + this.vr[Rb][i]; }
  opVMul() { const [Rd,Ra,Rb] = this._readC(); for (let i = 0; i < 256; i++) this.vr[Rd][i] = this.vr[Ra][i] * this.vr[Rb][i]; }
  opVDot() { const [Rd,Ra,Rb] = this._readC(); let sum = 0; for (let i = 0; i < 256; i++) sum += this.vr[Ra][i] * this.vr[Rb][i]; this.fp[Rd] = sum; }
  
  // Format D opcodes
  opIInc() {
    if (this.pc + 3 >= this.memorySize) { this.state = 'panicked'; return; }
    const Rd = this.memory[this.pc + 1];
    const immLo = this.memory[this.pc + 2];
    const immHi = this.memory[this.pc + 3];
    let imm = immLo | (immHi << 8);
    if (imm >= 0x8000) imm -= 0x10000;
    this.gp[Rd] += imm;
    this.pc += 4;
  }
  opIDec() {
    if (this.pc + 3 >= this.memorySize) { this.state = 'panicked'; return; }
    const Rd = this.memory[this.pc + 1];
    const immLo = this.memory[this.pc + 2];
    const immHi = this.memory[this.pc + 3];
    let imm = immLo | (immHi << 8);
    if (imm >= 0x8000) imm -= 0x10000;
    this.gp[Rd] -= imm;
    this.pc += 4;
  }
  opStackAlloc() {
    if (this.pc + 3 >= this.memorySize) { this.state = 'panicked'; return; }
    const Rd = this.memory[this.pc + 1];
    const immLo = this.memory[this.pc + 2];
    const immHi = this.memory[this.pc + 3];
    const size = immLo | (immHi << 8);
    this.sp -= size;
    this.gp[Rd] = this.sp;
    this.pc += 4;
  }
  
  // Format E opcodes
  opLoad8() {
    if (this.pc + 4 >= this.memorySize) { this.state = 'panicked'; return; }
    const Rd = this.memory[this.pc + 1];
    const Rb = this.memory[this.pc + 2];
    const off = this.memory[this.pc + 3] | (this.memory[this.pc + 4] << 8);
    this.gp[Rd] = this.memory[Rb + off] ?? 0;
    this.pc += 5;
  }
  opLoad16() {
    if (this.pc + 4 >= this.memorySize) { this.state = 'panicked'; return; }
    const Rd = this.memory[this.pc + 1];
    const Rb = this.memory[this.pc + 2];
    const off = this.memory[this.pc + 3] | (this.memory[this.pc + 4] << 8);
    this.gp[Rd] = this.memory[Rb + off] | (this.memory[Rb + off + 1] << 8);
    this.pc += 5;
  }
  opLoad32() {
    if (this.pc + 4 >= this.memorySize) { this.state = 'panicked'; return; }
    const Rd = this.memory[this.pc + 1];
    const Rb = this.memory[this.pc + 2];
    const off = this.memory[this.pc + 3] | (this.memory[this.pc + 4] << 8);
    this.gp[Rd] = this.memory[Rb + off] | (this.memory[Rb + off + 1] << 8) | 
                 (this.memory[Rb + off + 2] << 16) | (this.memory[Rb + off + 3] << 24);
    this.pc += 5;
  }
  opStore8() {
    if (this.pc + 4 >= this.memorySize) { this.state = 'panicked'; return; }
    const Rs = this.memory[this.pc + 1];
    const Rb = this.memory[this.pc + 2];
    const off = this.memory[this.pc + 3] | (this.memory[this.pc + 4] << 8);
    this.memory[Rb + off] = this.gp[Rs] & 0xFF;
    this.pc += 5;
  }
  opStore16() {
    if (this.pc + 4 >= this.memorySize) { this.state = 'panicked'; return; }
    const Rs = this.memory[this.pc + 1];
    const Rb = this.memory[this.pc + 2];
    const off = this.memory[this.pc + 3] | (this.memory[this.pc + 4] << 8);
    this.memory[Rb + off] = this.gp[Rs] & 0xFF;
    this.memory[Rb + off + 1] = (this.gp[Rs] >> 8) & 0xFF;
    this.pc += 5;
  }
  opStore32() {
    if (this.pc + 4 >= this.memorySize) { this.state = 'panicked'; return; }
    const Rs = this.memory[this.pc + 1];
    const Rb = this.memory[this.pc + 2];
    const off = this.memory[this.pc + 3] | (this.memory[this.pc + 4] << 8);
    this.memory[Rb + off] = this.gp[Rs] & 0xFF;
    this.memory[Rb + off + 1] = (this.gp[Rs] >> 8) & 0xFF;
    this.memory[Rb + off + 2] = (this.gp[Rs] >> 16) & 0xFF;
    this.memory[Rb + off + 3] = (this.gp[Rs] >> 24) & 0xFF;
    this.pc += 5;
  }
  opLoadAddr() {
    if (this.pc + 4 >= this.memorySize) { this.state = 'panicked'; return; }
    const Rd = this.memory[this.pc + 1];
    const Rb = this.memory[this.pc + 2];
    const off = this.memory[this.pc + 3] | (this.memory[this.pc + 4] << 8);
    this.gp[Rd] = Rb + off;
    this.pc += 5;
  }
  opVLoad() {
    if (this.pc + 4 >= this.memorySize) { this.state = 'panicked'; return; }
    const Rd = this.memory[this.pc + 1];
    const Rb = this.memory[this.pc + 2];
    const off = this.memory[this.pc + 3] | (this.memory[this.pc + 4] << 8);
    for (let i = 0; i < 256; i++) this.vr[Rd][i] = this.memory[Rb + off + i] ?? 0;
    this.pc += 5;
  }
  opVStore() {
    if (this.pc + 4 >= this.memorySize) { this.state = 'panicked'; return; }
    const Rs = this.memory[this.pc + 1];
    const Rb = this.memory[this.pc + 2];
    const off = this.memory[this.pc + 3] | (this.memory[this.pc + 4] << 8);
    for (let i = 0; i < 256; i++) this.memory[Rb + off + i] = this.vr[Rs][i];
    this.pc += 5;
  }
  
  // Format G opcodes
  opJump() {
    if (this.pc + 2 >= this.memorySize) { this.state = 'panicked'; return; }
    const off = this.memory[this.pc + 1] | (this.memory[this.pc + 2] << 8);
    const signed = (off >= 0x8000) ? off - 0x10000 : off;
    this.pc += signed + 3;
  }
  opJumpIf() {
    if (this.pc + 2 >= this.memorySize) { this.state = 'panicked'; return; }
    const Rd = this.memory[this.pc + 3];
    const off = this.memory[this.pc + 1] | (this.memory[this.pc + 2] << 8);
    const signed = (off >= 0x8000) ? off - 0x10000 : off;
    if (this.gp[Rd] !== 0) this.pc += signed + 3; else this.pc += 3;
  }
  opJumpIfNot() {
    if (this.pc + 2 >= this.memorySize) { this.state = 'panicked'; return; }
    const Rd = this.memory[this.pc + 3];
    const off = this.memory[this.pc + 1] | (this.memory[this.pc + 2] << 8);
    const signed = (off >= 0x8000) ? off - 0x10000 : off;
    if (this.gp[Rd] === 0) this.pc += signed + 3; else this.pc += 3;
  }
  opCall() {
    if (this.pc + 2 >= this.memorySize) { this.state = 'panicked'; return; }
    const target = this.memory[this.pc + 1] | (this.memory[this.pc + 2] << 8);
    // Push return address
    this.sp -= 4;
    this.memory[this.sp] = (this.pc + 3) & 0xFF;
    this.memory[this.sp + 1] = ((this.pc + 3) >> 8) & 0xFF;
    this.memory[this.sp + 2] = ((this.pc + 3) >> 16) & 0xFF;
    this.memory[this.sp + 3] = ((this.pc + 3) >> 24) & 0xFF;
    this.pc = target;
  }
  opCallIndirect() {
    if (this.pc + 1 >= this.memorySize) { this.state = 'panicked'; return; }
    const Rb = this.memory[this.pc + 1];
    this.pc = this.gp[Rb];
  }
  opASend() { this.pc++; console.warn('[A2A] ASend — stub (no fleet bus)'); }
  opARecv() { this.pc++; console.warn('[A2A] ARecv — stub'); }
  opAAsk() { this.pc++; console.warn('[A2A] AAsk — stub'); }
  opATell() { this.pc++; console.warn('[A2A] ATell — stub'); }
  opADelegate() { this.pc++; console.warn('[A2A] ADelegate — stub'); }
  opABroadcast() { this.pc++; console.warn('[A2A] ABroadcast — stub'); }
  opASubscribe() { this.pc++; console.warn('[A2A] ASubscribe — stub'); }
  opAWait() { this.pc++; console.warn('[A2A] AWait — stub'); }
  opATrust() { this.pc++; console.warn('[A2A] ATrust — stub'); }
  opAVerify() { this.pc++; console.warn('[A2A] AVerify — stub'); }
  
  regs() {
    return {
      gp: Array.from(this.gp),
      fp: Array.from(this.fp),
      pc: this.pc,
      sp: this.sp,
      fp_reg: this.fp_reg,
      flags: this.flags,
      state: this.state
    };
  }
  stats() {
    return {
      cycles: this.cyclesUsed,
      instructions: this.instructionCount,
      state: this.state
    };
  }
  reset() {
    this.gp = new Int32Array(16);
    this.fp = new Float32Array(16);
    this.vr = [];
    for (let i = 0; i < 16; i++) this.vr.push(new Uint8Array(256));
    this.pc = 0;
    this.sp = this.memorySize;
    this.fp_reg = 0;
    this.flags = 0;
    this.state = 'halted';
    this.cyclesUsed = 0;
    this.instructionCount = 0;
    this.memory.fill(0);
  }
}

/**
 * Simple FLUX Assembler — text assembly to Uint8Array bytecode
 */
class FluxAssembler {
  static assemble(source) {
    const labels = {};
    const lines = source.split('\n').filter(l => {
      l = l.trim();
      if (!l || l.startsWith('#') || l.startsWith('//')) return false;
      return true;
    });
    
    // First pass: collect labels
    let bytecode = [];
    let pc = 0;
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0 && !line.includes(' ')) {
        labels[line.trim().slice(0, -1)] = pc;
      } else {
        bytecode.push(line);
      }
    }
    
    // Second pass: assemble
    const output = [];
    for (const line of bytecode) {
      const parts = line.trim().split(/\s+/);
      const op = parts[0].toUpperCase();
      const args = parts.slice(1).map(a => a.trim());
      
      const encode = (bytes) => bytes.forEach(b => output.push(b));
      const reg = (r) => {
        const aliases = { RV:8, A0:9, A1:10, SP:11, FP:12, FL:13, TP:14, LR:15 };
        if (aliases[r]) return aliases[r];
        return parseInt(r.replace(/^R/i,''));
      };
      const imm16 = (v) => {
        v = parseInt(v);
        if (v < 0) v = (v + 0x10000) & 0xFFFF;
        return [v & 0xFF, (v >> 8) & 0xFF];
      };
      
      switch (op) {
        case 'HALT': output.push(0x00); pc++; break;
        case 'NOP': output.push(0x01); pc++; break;
        case 'RET': output.push(0x02); pc++; break;
        case 'YIELD': output.push(0x08); pc++; break;
        case 'PUSH': encode([0x10, reg(args[0]), reg(args[1])]); pc += 3; break;
        case 'POP': encode([0x11, reg(args[0]), 0]); pc += 3; break;
        case 'DUP': encode([0x12, reg(args[0]), reg(args[1])]); pc += 3; break;
        case 'SWAP': encode([0x13, reg(args[0]), reg(args[1])]); pc += 3; break;
        case 'IMOV': encode([0x20, reg(args[0]), reg(args[1])]); pc += 3; break;
        case 'FMOV': encode([0x40, reg(args[0]), reg(args[1])]); pc += 3; break;
        case 'IADD': encode([0x21, reg(args[0]), reg(args[1]), reg(args[2])]); pc += 4; break;
        case 'ISUB': encode([0x22, reg(args[0]), reg(args[1]), reg(args[2])]); pc += 4; break;
        case 'IMUL': encode([0x23, reg(args[0]), reg(args[1]), reg(args[2])]); pc += 4; break;
        case 'IDIV': encode([0x24, reg(args[0]), reg(args[1]), reg(args[2])]); pc += 4; break;
        case 'IMOD': encode([0x25, reg(args[0]), reg(args[1]), reg(args[2])]); pc += 4; break;
        case 'INEG': encode([0x26, reg(args[0]), reg(args[1]), 0]); pc += 4; break;
        case 'IABS': encode([0x27, reg(args[0]), reg(args[1]), 0]); pc += 4; break;
        case 'IAND': encode([0x2C, reg(args[0]), reg(args[1]), reg(args[2])]); pc += 4; break;
        case 'IOR': encode([0x2D, reg(args[0]), reg(args[1]), reg(args[2])]); pc += 4; break;
        case 'IXOR': encode([0x2E, reg(args[0]), reg(args[1]), reg(args[2])]); pc += 4; break;
        case 'ISHL': encode([0x2F, reg(args[0]), reg(args[1]), reg(args[2])]); pc += 4; break;
        case 'ISHR': encode([0x30, reg(args[0]), reg(args[1]), reg(args[2])]); pc += 4; break;
        case 'INOT': encode([0x31, reg(args[0]), reg(args[1]), 0]); pc += 4; break;
        case 'ICMPEQ': encode([0x32, reg(args[0]), reg(args[1]), reg(args[2])]); pc += 4; break;
        case 'ICMPNE': encode([0x33, reg(args[0]), reg(args[1]), reg(args[2])]); pc += 4; break;
        case 'ICMPLT': encode([0x34, reg(args[0]), reg(args[1]), reg(args[2])]); pc += 4; break;
        case 'ICMPLE': encode([0x35, reg(args[0]), reg(args[1]), reg(args[2])]); pc += 4; break;
        case 'ICMPGT': encode([0x36, reg(args[0]), reg(args[1]), reg(args[2])]); pc += 4; break;
        case 'ICMPGE': encode([0x37, reg(args[0]), reg(args[1]), reg(args[2])]); pc += 4; break;
        case 'IINC': encode([0x28, reg(args[0]), ...imm16(args[1])]); pc += 4; break;
        case 'IDEC': encode([0x29, reg(args[0]), ...imm16(args[1])]); pc += 4; break;
        case 'STACKALLOC': encode([0x79, reg(args[0]), ...imm16(args[1])]); pc += 4; break;
        case 'LOAD8': encode([0x70, reg(args[0]), reg(args[1]), ...imm16(args[2])]); pc += 5; break;
        case 'LOAD32': encode([0x72, reg(args[0]), reg(args[1]), ...imm16(args[2])]); pc += 5; break;
        case 'STORE8': encode([0x74, reg(args[0]), reg(args[1]), ...imm16(args[2])]); pc += 5; break;
        case 'STORE32': encode([0x76, reg(args[0]), reg(args[1]), ...imm16(args[2])]); pc += 5; break;
        case 'LOADADDR': encode([0x78, reg(args[0]), reg(args[1]), ...imm16(args[2])]); pc += 5; break;
        case 'FADD': encode([0x41, reg(args[0]), reg(args[1]), reg(args[2])]); pc += 4; break;
        case 'FSUB': encode([0x42, reg(args[0]), reg(args[1]), reg(args[2])]); pc += 4; break;
        case 'FMUL': encode([0x43, reg(args[0]), reg(args[1]), reg(args[2])]); pc += 4; break;
        case 'FDIV': encode([0x44, reg(args[0]), reg(args[1]), reg(args[2])]); pc += 4; break;
        case 'FSQRT': encode([0x48, reg(args[0]), reg(args[1]), 0]); pc += 4; break;
        case 'ITOF': encode([0x60, reg(args[0]), reg(args[1]), 0]); pc += 4; break;
        case 'FTOI': encode([0x61, reg(args[0]), reg(args[1]), 0]); pc += 4; break;
        case 'JUMP': {
          const label = args[0];
          const target = labels[label] ?? 0;
          const offset = target - pc - 3;
          output.push(0x03, offset & 0xFF, (offset >> 8) & 0xFF);
          pc += 3;
          break;
        }
        case 'JUMPIF': {
          const label = args[1];
          const target = labels[label] ?? 0;
          const offset = target - pc - 3;
          output.push(0x04, offset & 0xFF, (offset >> 8) & 0xFF, reg(args[0]));
          pc += 4;
          break;
        }
        case 'JUMPIFNOT': {
          const label = args[1];
          const target = labels[label] ?? 0;
          const offset = target - pc - 3;
          output.push(0x05, offset & 0xFF, (offset >> 8) & 0xFF, reg(args[0]));
          pc += 4;
          break;
        }
        case 'CALL': {
          const target = labels[args[0]] ?? parseInt(args[0]);
          output.push(0x06, target & 0xFF, (target >> 8) & 0xFF);
          pc += 3;
          break;
        }
        case 'ASEND': output.push(0x80); pc++; break;
        default: throw new Error(`Unknown opcode: ${op}`);
      }
    }
    
    return new Uint8Array(output);
  }
}

// Export for use as module
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FluxVM, FluxAssembler };
}
// Also attach to window for browser use
if (typeof window !== 'undefined') {
  window.FluxVM = FluxVM;
  window.FluxAssembler = FluxAssembler;
}
