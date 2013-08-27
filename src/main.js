var http = require('http');
var handler = require("./handler");

http.createServer(function (request, response) {
    var requestHandler = new handler.RequestHandler(request).activate(response);
}).listen(8081);

