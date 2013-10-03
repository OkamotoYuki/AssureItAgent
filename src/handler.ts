///<reference path='../d.ts/DefinitelyTyped/node/node.d.ts'/>

import fs = module('fs');
import http = module('http');
import child_process = module('child_process');
import config = module('config');
import status = module('status');
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

	/* Deploy */
	// deploy procedure which is made with D-Case
	Deploy(params: any): void {
		this.Kill(null);

		var script: any = params.script;
		var meta: any = params.meta;

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

		/* set config script */
		var configFile: string = 'config.ds';
		var configScript: string = "";
		configScript += 'require dshell;\n';
		configScript += 'const LOCATION = "'+config.conf.location+'";\n';
		//configScript += 'let DCaseRevision = 2;\n';   // TODO: move to status.stat
		//configScript += 'let RecServer = "http://127.0.0.1:3001";\n';   // TODO: move to config.json
		//configScript += 'let AssumedFault = "UnknownFault";\n';   // TODO: move to config.json?
		fs.writeFileSync(scriptDir+'/'+configFile, configScript);

		/* set main script */
		if(!('main' in script)) {
			this.response.SetError({ code: -1, message: "request must have one main script" });
			this.response.Send();
			return;
		}
		var mainFile: string = 'main.ds';
		fs.writeFileSync(scriptDir+'/'+mainFile, script.main);

		/* set library script */
		if('lib' in script) {
			for(var libFile in script.lib) {
				fs.writeFileSync(scriptDir+'/'+libFile, script.lib[libFile]);
			}
		}

		/* set entry script */
		var actionmap: any[] = meta.actionmap;
		var entryFiles: string[] = [];   // used in executing scripts

		for(var actionKey in actionmap) {
			var action = actionmap[actionKey];
			var actiontype: string = action["actiontype"];
			var reaction: string = action["reaction"];

			if((actiontype != "Monitor") && (actiontype != "Boot")) {   // TODO: support other actiontype
				continue;
			}

			var entryFile: string = actionKey+'.ds';
			entryFiles.push(entryFile);

			var entryScript: string = "";
			entryScript += "@Export void main() {\n";
			entryScript += "\tcommand sleep;\n";
			entryScript += "\tRuntimeContext ctx = new RuntimeContext();\n";
			entryScript += "\tDFault f = null;\n";
			if((actiontype != null) && (actiontype == "Monitor")) {
				entryScript += "\twhile(true) {\n";
				//entryScript += "\t\tprint('monitoring...\\n');\n";

				var codegen = function (indent: string) {
					entryScript += indent + "f = "+actionKey+"(ctx);\n";
					entryScript += indent + "if(f != null) {\n";
					if(action != null) {
						actionKey = action["reaction"];
						if((actionKey != null) && (actionKey != "")) {
							action = actionmap[actionKey];
							codegen(indent + "\t");
						}
					}
					entryScript += indent + "}\n";
				}
				codegen("\t\t");

				entryScript += "\t\tsleep 1\n";
				entryScript += "\t}\n";
			}
			else {
				// TODO: add other case
			}
			entryScript += "}\n";

			fs.writeFileSync(scriptDir+'/'+entryFile, entryScript);
		}

		/* execute script */
		var commandHeader: string = "";

		if(config.conf.runtime == 'bash') {
			commandHeader = 'bash ';
		}
		else if(config.conf.runtime == 'D-Shell') {
			commandHeader = 'greentea ';
		}
		else {
			this.response.SetError({ code: -1, message: "Assure-It agent doesn't support such a script runtime" });
			this.response.Send();
			return;
		}

		commandHeader += ' '+scriptDir+'/'+configFile;
		for(var libFile in script.lib) {
			commandHeader += ' '+scriptDir+'/'+libFile;
		}
		commandHeader += ' '+scriptDir+'/'+mainFile;

		for(var i: number = 0; i < entryFiles.length; i++) {
			var command: string = commandHeader+' '+scriptDir+'/'+entryFiles[i];
			debug.outputDebugMessage(command);
			var child = child_process.exec(command, null, function(error, stdout, stderr) {
				// do nothing
			});
			child.stdout.on('data', function(chunk: string) {
				console.log(chunk);   // for debug
			});
			child.stderr.on('data', function(chunk: string) {
				console.log(chunk);   // for debug
			});
			status.stat.children.push(child);
		}

		this.response.Send();
	}

	/* Kill */
	// kill all process which is managed by Assure-It agent
	Kill(params: any) {
		for(var i: number = 0; i < status.stat.children.length; i++) {
			status.stat.children[i].kill();
		}
		status.stat.children = [];
	}

}
