///<reference path='../d.ts/DefinitelyTyped/node/node.d.ts'/>

import http = module('http');
import handler = module('handler');
import debug = module('debug');

http.createServer(function(request: http.ServerRequest, response: http.ServerResponse): void {
	var requestHandler = new handler.RequestHandler(request);
	requestHandler.Activate(response);
}).listen(8081);

process.on('uncaughtException', function (error: string) {
	debug.outputErrorMessage('uncaughtException => ' + error);
});
