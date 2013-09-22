var fs = require('fs');


var confText = fs.readFileSync('config.json', 'utf-8');
exports.conf = JSON.parse(confText);

