var fs = require('fs');

var child_process = require('child_process');
var config = require("./config");
var status = require("./status");
var debug = require("./debug");

var RequestHandler = (function () {
    function RequestHandler(serverRequest) {
        this.request = new Request(serverRequest);
    }
    RequestHandler.prototype.Activate = function (serverResponse) {
        var self = this;

        this.request.serverRequest.on('data', function (chunk) {
            self.request.body += chunk;
        });

        this.request.serverRequest.on('end', function () {
            var response = new Response(serverResponse);

            if (self.request.method != 'POST') {
                response.SetStatusCode(400);
                response.SetError({ code: -1, message: 'AssureIt agent allows "POST"only' });
                response.Send();
                return;
            }

            if (!self.request.IsValid()) {
                response.SetStatusCode(400);
                response.SetError({ code: -1, message: 'jsonrpc has invalid format' });
                response.Send();
                return;
            }

            var jsonrpc = JSON.parse(self.request.body);

            var api = new AssureItAgentAPI(jsonrpc, response);
            api.Invoke();
        });
    };
    return RequestHandler;
})();
exports.RequestHandler = RequestHandler;

var Request = (function () {
    function Request(serverRequest) {
        this.serverRequest = serverRequest;
        this.method = this.serverRequest.method;
        this.body = "";
    }
    Request.prototype.IsValid = function () {
        try  {
            var json = JSON.parse(this.body);
            if (!(('jsonrpc' in json) && ('id' in json) && ('method' in json) && ('params' in json))) {
                return false;
            }
        } catch (e) {
            return false;
        }
        return true;
    };
    return Request;
})();

var Response = (function () {
    function Response(serverResponse) {
        this.serverResponse = serverResponse;
        this.body = { jsonrpc: '2.0', id: 0 };
        this.statusCode = 200;
    }
    Response.prototype.SetStatusCode = function (code) {
        this.statusCode = code;
    };

    Response.prototype.SetResult = function (result) {
        this.body['result'] = result;
    };

    Response.prototype.SetError = function (error) {
        this.body['error'] = error;
    };

    Response.prototype.Send = function () {
        this.serverResponse.writeHead(this.statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        this.serverResponse.write(JSON.stringify(this.body));
        this.serverResponse.end();
    };
    return Response;
})();

var AssureItAgentAPI = (function () {
    function AssureItAgentAPI(jsonrpc, response) {
        this.jsonrpc = jsonrpc;
        this.response = response;
    }
    AssureItAgentAPI.prototype.Invoke = function () {
        try  {
            this[this.jsonrpc.method](this.jsonrpc.params);
        } catch (e) {
            this.response.SetStatusCode(400);
            this.response.SetError({ code: -1, message: "Assure-It agent doesn't have such a method" });
            this.response.Send();
        }
    };

    AssureItAgentAPI.prototype.Deploy = function (params) {
        this.Kill(null);

        var script = params.script;
        var meta = params.meta;

        try  {
            fs.statSync('/tmp/assureit-agent');
        } catch (e) {
            fs.mkdirSync('/tmp/assureit-agent');
        }

        var scriptDir = '/tmp/assureit-agent/' + process.pid;
        try  {
            fs.statSync(scriptDir);
        } catch (e) {
            fs.mkdirSync(scriptDir);
        }

        var configFile = 'config.ds';
        var configScript = "";
        configScript += 'require dshell;\n';
        configScript += 'const LOCATION = "' + config.conf.location + '";\n';
        configScript += 'let RECServerURL = "' + config.conf.rec + '";\n';
        fs.writeFileSync(scriptDir + '/' + configFile, configScript);

        if (!('main' in script)) {
            this.response.SetError({ code: -1, message: "request must have one main script" });
            this.response.Send();
            return;
        }
        var mainFile = 'main.ds';
        fs.writeFileSync(scriptDir + '/' + mainFile, script.main);

        if ('lib' in script) {
            for (var libFile in script.lib) {
                fs.writeFileSync(scriptDir + '/' + libFile, script.lib[libFile]);
            }
        }

        var actionmap = meta.actionmap;
        var entryFiles = [];

        for (var actionKey in actionmap) {
            var action = actionmap[actionKey];
            var actiontype = action["actiontype"];
            var reaction = action["reaction"];

            if ((actiontype != "Monitor") && (actiontype != "Boot")) {
                continue;
            }

            var entryFile = actionKey + '.ds';
            entryFiles.push(entryFile);

            var entryScript = "";
            entryScript += "@Export void main() {\n";
            entryScript += "\tcommand sleep;\n";
            entryScript += "\tRuntimeContext ctx = new RuntimeContext();\n";
            entryScript += "\tDFault f = null;\n";
            if ((actiontype != null) && (actiontype == "Monitor")) {
                entryScript += "\twhile(true) {\n";

                var codegen = function (indent) {
                    entryScript += indent + "f = " + actionKey + "(ctx);\n";
                    entryScript += indent + "if(f != null) {\n";
                    if (action != null) {
                        actionKey = action["reaction"];
                        if ((actionKey != null) && (actionKey != "")) {
                            action = actionmap[actionKey];
                            codegen(indent + "\t");
                        }
                    }
                    entryScript += indent + "}\n";
                };
                codegen("\t\t");

                entryScript += "\t\tsleep 1\n";
                entryScript += "\t}\n";
            } else {
            }
            entryScript += "}\n";

            fs.writeFileSync(scriptDir + '/' + entryFile, entryScript);
        }

        var commandHeader = "";

        if (config.conf.runtime == 'bash') {
            commandHeader = 'bash ';
        } else if (config.conf.runtime == 'D-Shell') {
            commandHeader = 'greentea ';
        } else {
            this.response.SetError({ code: -1, message: "Assure-It agent doesn't support such a script runtime" });
            this.response.Send();
            return;
        }

        commandHeader += ' ' + scriptDir + '/' + configFile;
        for (var libFile in script.lib) {
            commandHeader += ' ' + scriptDir + '/' + libFile;
        }
        commandHeader += ' ' + scriptDir + '/' + mainFile;

        for (var i = 0; i < entryFiles.length; i++) {
            var command = commandHeader + ' ' + scriptDir + '/' + entryFiles[i];
            debug.outputDebugMessage(command);
            var child = child_process.exec(command, null, function (error, stdout, stderr) {
            });
            child.stdout.on('data', function (chunk) {
                console.log(chunk);
            });
            child.stderr.on('data', function (chunk) {
                console.log(chunk);
            });
            status.stat.children.push(child);
        }

        this.response.Send();
    };

    AssureItAgentAPI.prototype.Kill = function (params) {
        for (var i = 0; i < status.stat.children.length; i++) {
            status.stat.children[i].kill();
        }
        status.stat.children = [];
    };
    return AssureItAgentAPI;
})();

