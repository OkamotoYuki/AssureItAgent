///<reference path='../d.ts/DefinitelyTyped/node/node.d.ts'/>

import fs = module('fs');
import http = module('http');
import child_process = module('child_process');
import config = module('config');
import debug = module('debug');


interface JsonRpc {
	jsonrpc: string;
	id: number;
}


interface JsonRpcRequest {
	method: string;
	params: any;
}


interface Error {
	code: number;
	message: string;
}


export class RequestHandler {

	private request: Request;

	constructor(serverRequest: http.ServerRequest) {
		this.request = new Request(serverRequest);
	}

	Activate(serverResponse: http.ServerResponse): void {
		var self = this;

		this.request.serverRequest.on('data', function(chunk: string) {
			self.request.body += chunk;
		});

		this.request.serverRequest.on('end', function() {
			var response = new Response(serverResponse);

			if(self.request.method != 'POST') {
				response.SetStatusCode(400);
				response.SetError({ code: -1, message: 'AssureIt agent allows "POST"only' });   // TODO: fix code
				response.Send();
				return;
			}

			if(!self.request.IsValid()) {
				response.SetStatusCode(400);
				response.SetError({ code: -1, message: 'jsonrpc has invalid format' });   // TODO: fix code
				response.Send();
				return;
			}

			var jsonrpc = JSON.parse(self.request.body);

			var api = new AssureItAgentAPI(<JsonRpcRequest>jsonrpc, response);
			api.Invoke();
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

	IsValid(): boolean {
		try {
			var json = JSON.parse(this.body);
			if(!(('jsonrpc' in json) && ('id' in json) && ('method' in json) && ('params' in json))) {   // json doesn't have enough data
				return false;
			}
		}
		catch(e) {
			return false;   // parse error
		}
		return true;
	}
}


class Response {

	serverResponse: http.ServerResponse;
	body: JsonRpc;
	statusCode: number;

	constructor(serverResponse: http.ServerResponse) {
		this.serverResponse = serverResponse;
		this.body = { jsonrpc: '2.0', id: 0 };
		this.statusCode = 200;
	}

	SetStatusCode(code: number) {
		this.statusCode = code;
	}

	SetResult(result: number) {
		this.body['result'] = result;
	}

	SetError(error: Error) {
		this.body['error'] = error;
	}

	Send(): void {
		this.serverResponse.writeHead(this.statusCode, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'});
		this.serverResponse.write(JSON.stringify(this.body));
		this.serverResponse.end();
	}

}


class AssureItAgentAPI {

	private jsonrpc: JsonRpcRequest;
	private response: Response;

	constructor(jsonrpc: JsonRpcRequest, response: Response) {
		this.jsonrpc = jsonrpc;
		this.response = response;
	}

	Invoke(): void {
		try {
			this[this.jsonrpc.method](this.jsonrpc.params);
		}
		catch(e) {
			this.response.SetStatusCode(400);
			this.response.SetError({ code: -1, message: "Assure-It agent doesn't have such a method" });   // TODO: fix code
			this.response.Send();
		}
	}

	Deploy(params: any): void {
		var script: any = params.script;

		/* script directory */
		try {
			fs.statSync('/tmp/assureit-agent');
		}
		catch(e) {
			fs.mkdirSync('/tmp/assureit-agent');
		}

		var scriptDir: string = '/tmp/assureit-agent/'+process.pid;
		try {
			fs.statSync(scriptDir);
		}
		catch(e) {
			fs.mkdirSync(scriptDir);
		}

		/* set main script */
		if(!("main" in script) || !(Object.keys(script.main).length == 1)) {
			this.response.SetError({ code: -1, message: "request must have one main script" });
			this.response.Send();
			return;
		}

		var mainFile: string = Object.keys(script.main)[0];
		fs.writeFileSync(scriptDir+'/'+mainFile, script.main[mainFile]);

		/* set library script */
		if("lib" in script) {
			for(var file in script.lib) {
				fs.writeFileSync(scriptDir+'/'+file, script.lib[file]);
			}
		}

		/* execute script */
		var command: string = "";
		if(config.conf.runtime == 'bash') {
			command = 'bash ';
		}
		else if(config.conf.runtime == 'D-Shell') {
			command = 'greentea ';
		}
		else {
			this.response.SetError({ code: -1, message: "Assure-It agent doesn't support such a script runtime" });
			this.response.Send();
			return;
		}

		for(var file in script.lib) {
			command += ' '+scriptDir+'/'+file;
		}
		command += ' '+scriptDir+'/'+mainFile;

		child_process.exec(command, null, function(error, stdout, stderr) {
			console.log(command);
			console.log('====OUT====');
			console.log(stdout);
			console.log('===ERROR===');
			console.log(stderr);
		});

		this.response.Send();
	}

}
