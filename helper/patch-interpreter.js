'use strict';
// Replace only the known temporary ELF interpreter in the copied ARMHF binary.
var fs = require('fs');
var file = process.argv[2];
var oldValue = Buffer.from('/tmp/ldhf\0', 'ascii');
var newValue = Buffer.from('/home/r/l\0', 'ascii');
if (!file || oldValue.length !== newValue.length) throw new Error('invalid_arguments');
var binary = fs.readFileSync(file);
if (binary.toString('ascii', 1, 4) !== 'ELF' || binary[4] !== 1 || binary[5] !== 1) throw new Error('not_armhf_elf');
var phoff = binary.readUInt32LE(28), phentsize = binary.readUInt16LE(42), phnum = binary.readUInt16LE(44);
var offset = -1;
for (var i = 0; i < phnum; i++) {
  var entry = phoff + i * phentsize;
  if (binary.readUInt32LE(entry) === 3) { offset = binary.readUInt32LE(entry + 4); break; }
}
if (offset < 0 || !binary.slice(offset, offset + oldValue.length).equals(oldValue)) throw new Error('unexpected_interpreter');
newValue.copy(binary, offset);
fs.writeFileSync(file, binary);
console.log('ELF interpreter changed to /home/r/l');
