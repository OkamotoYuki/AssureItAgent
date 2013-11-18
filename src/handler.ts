///<reference path='../d.ts/DefinitelyTyped/node/node.d.ts'/>
///<reference path='../d.ts/DefinitelyTyped/async/async.d.ts'/>

import fs = module('fs');
import http = module('http');
import child_process = module('child_process');
import async = module('async');
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
		configScript += 'const LOCATION = "'+config.conf.location+'";\n';
		configScript += 'let RECServerURL = "'+config.conf.rec+'";\n';
		fs.writeFileSync(scriptDir+'/'+configFile, configScript);

		/* set definition script */
		if(!('main' in script)) {
			this.response.SetError({ code: -1, message: "request must have one main script" });
			this.response.Send();
			return;
		}
		var definitionFile: string = 'definition.ds';
		fs.writeFileSync(scriptDir+'/'+definitionFile, script.main);

		/* set library script */
		if('lib' in script) {
			for(var libFile in script.lib) {
				fs.writeFileSync(scriptDir+'/'+libFile, script.lib[libFile]);
			}
		}

		/* set main script */
		var actionmap: any[] = meta.actionmap;
		var mainFiles: string[] = [];   // used in executing scripts

		for(var actionKey in actionmap) {
			var action = actionmap[actionKey];
			var actiontype: string = action["actiontype"];
			var reaction: string = action["reaction"];

			if((actiontype != "Monitor") && (actiontype != "Boot")) {   // TODO: support other actiontype
				continue;
			}

			var mainFile: string = actionKey+'.ds';
			mainFiles.push(mainFile);

			var mainScript: string = "";
			mainScript += "@Export void main() {\n";
			mainScript += "\tcommand sleep;\n";
			mainScript += "\tDFault f = null;\n";
			if((actiontype != null) && (actiontype == "Monitor")) {
				mainScript += "\twhile(true) {\n";
				//mainScript += "\t\tprint('monitoring...\\n');\n";

				var codegen = function (indent: string) {
					mainScript += indent + "f = "+actionKey+"();\n";
					mainScript += indent + "if(f != null) {\n";
					if(action != null) {
						actionKey = action["reaction"];
						if((actionKey != null) && (actionKey != "")) {
							action = actionmap[actionKey];
							codegen(indent + "\t");
						}
					}
					mainScript += indent + "}\n";
				}
				codegen("\t\t");

				mainScript += "\t\tsleep 1\n";
				mainScript += "\t}\n";
			}
			else {
				// TODO: add other case
			}
			mainScript += "}\n";

			fs.writeFileSync(scriptDir+'/'+mainFile, mainScript);
		}

		/* execute script */
		var runtime: string = "";

		if(config.conf.runtime == 'bash') {
			runtime = 'bash';
		}
		else if(config.conf.runtime == 'D-Shell') {
			runtime = 'dshell';
		}
		else {
			this.response.SetError({ code: -1, message: "Assure-It agent doesn't support such a script runtime" });
			this.response.Send();
			return;
		}

		var files: string = configFile;
		for(var libFile in script.lib) {
			files += ' '+libFile;
		}
		files += ' '+definitionFile;

		var i: number = 0;
		async.forEach(mainFiles, function(mainFile, callback) {
			var entryFile: string = 'entry_'+i+'.ds';
			var catCommand: string = 'cat '+files+' '+mainFile+' > '+entryFile;
			debug.outputDebugMessage(catCommand);
			var runtimeCommand: string = runtime+' '+entryFile;
			debug.outputDebugMessage(runtimeCommand);

			child_process.exec(catCommand, { cwd: scriptDir }, function(error, stdout, stderr) {
				var child = child_process.exec(runtimeCommand, { cwd: scriptDir }, function(error, stdout, stderr) {
					// do nothing
				});
				child.stdout.on('data', function(chunk: string) {
					console.log(chunk);   // for debug
				});
				child.stderr.on('data', function(chunk: string) {
					console.log(chunk);   // for debug
				});
				status.stat.children.push(child);
			});

			i++;
			callback(null, null);
		}, function() { /* do nothing */ });

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
