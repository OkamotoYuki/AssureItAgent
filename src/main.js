var http = require('http');
var handler = require("./handler");

http.createServer(function (request, response) {
    var requestHandler = new handler.RequestHandler(request, response);
    requestHandler.invokeHandlerAPI();
    requestHandler.sendResponse();
}).listen(8081);

