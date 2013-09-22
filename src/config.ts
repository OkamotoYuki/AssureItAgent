///<reference path='../d.ts/DefinitelyTyped/node/node.d.ts'/>

import fs = module('fs');
import debug = module('debug');


var confText: string = fs.readFileSync('config.json', 'utf-8');
export var conf = JSON.parse(confText);
