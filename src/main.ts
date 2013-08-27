///<reference path='../d.ts/DefinitelyTyped/node/node.d.ts'/>

import http = module('http');
import handler = module('handler');

http.createServer(function(request: http.ServerRequest, response: http.ServerResponse): void {
	var requestHandler = new handler.RequestHandler(request, response);
	requestHandler.invokeHandlerAPI();
	requestHandler.sendResponse();
}).listen(8081);
