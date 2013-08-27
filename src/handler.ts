///<reference path='../d.ts/DefinitelyTyped/node/node.d.ts'/>

import http = module('http');
import debug = module('debug');

export class RequestHandler {

	private request: Request;

	constructor(serverRequest: http.ServerRequest) {
		this.request = new Request(serverRequest);
	}

	activate(serverResponse: http.ServerResponse): void {
		var self = this;

		this.request.serverRequest.on('data', function(chunk: string) {
			self.request.body += chunk;
		});

		this.request.serverRequest.on('end', function() {
			var response = new Response(serverResponse);

			if(self.request.method != 'POST') {
				response.statusCode = 400;
				response.send()
				return;
			}

			var api = new AssureItAgentAPI(self.request.body, response);
			api.invoke();
		});
	}

}

class Request {

	serverRequest: http.ServerRequest;
	method: string;
	body: string;

	constructor(serverRequest: http.ServerRequest) {
		this.serverRequest = serverRequest;
		this.method = this.serverRequest.method;
		this.body = "";
	}
}

class Response {

	serverResponse: http.ServerResponse;
	body: string;
	statusCode: number;

	constructor(serverResponse: http.ServerResponse) {
		this.serverResponse = serverResponse;
		this.body = "";
		this.statusCode = 200;
	}

	send(): void {
		this.serverResponse.write(this.body);
		this.serverResponse.writeHead(this.statusCode, {'Content-Type': 'application/json'});
		this.serverResponse.end();
	}

}

class AssureItAgentAPI {

	private cmd: string;
	private response: Response;

	constructor(cmd: string, response: Response) {
		this.cmd = cmd;
		this.response = response;
	}

	invoke(): void {
		// TODO: imple me
		this.response.send();
	}

	executeScript(): void {
		// TODO: imple me
	}

}
