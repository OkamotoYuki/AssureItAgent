var http = require('http');
var handler = require("./handler");

var debug = require("./debug");

http.createServer(function (request, response) {
    var requestHandler = new handler.RequestHandler(request);
    requestHandler.Activate(response);
}).listen(8081);

process.on('uncaughtException', function (error) {
    debug.outputErrorMessage('uncaughtException => ' + error);
});

