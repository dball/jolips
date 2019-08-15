'use strict';

const readline = require('readline');
const stream = require('stream');
const core = require('./core');

const context = core.buildStandardContext(new Map([]));

const repl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "j> "
});

repl.on('line', (line) => {
  try {
    console.log(core.eval(context, line));
  } catch(error) {
    console.error(error);
  }
  repl.prompt();
});

repl.on('close', process.exit);

repl.prompt();
