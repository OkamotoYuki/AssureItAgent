///<reference path='../d.ts/DefinitelyTyped/node/node.d.ts'/>

import http = module('http');
import debug = module('debug');

export class RequestHandler {

	request: http.ServerRequest;
	response: http.ServerResponse;
	httpStatusCode: number;

	constructor(request: http.ServerRequest, response: http.ServerResponse) {
		this.request = request;
		this.response = response;
		this.httpStatusCode = 200;

		if(request.method != 'POST') {
			debug.outputErrorMessage("AssureItAgent allows 'POST' method only");
			this.response.write("AssureItAgent allows 'POST' method only"); // FIXME: replace it as json
			this.httpStatusCode = 400;
		}
	}

	invokeHandlerAPI(): void/* FIXME */ {
		if(this.httpStatusCode != 200) return;
		// TODO: imple me
	}

	executeScript(): void/* FIXME */ {
		if(this.httpStatusCode != 200) return;
		// TODO: imple me
	}

	sendResponse(): void/* FIXME */ {
		// TODO
		this.response.writeHead(this.httpStatusCode, {'Content-Type': 'application/json'});
		this.response.end();
	}

}
