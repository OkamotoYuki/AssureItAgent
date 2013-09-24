var fs = require('fs');

var child_process = require('child_process');
var config = require("./config");


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
        this.serverResponse.writeHead(this.statusCode, { 'Content-Type': 'application/json' });
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
        var script = params.script;

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

        if (!("main" in script) || !(Object.keys(script.main).length == 1)) {
            this.response.SetError({ code: -1, message: "request must have one main script" });
            this.response.Send();
            return;
        }

        var mainFile = Object.keys(script.main)[0];
        fs.writeFileSync(scriptDir + '/' + mainFile, script.main[mainFile]);

        if ("lib" in script) {
            for (var file in script.lib) {
                fs.writeFileSync(scriptDir + '/' + file, script.lib[file]);
            }
        }

        var command = "";
        if (config.conf.runtime == 'bash') {
            command = 'bash ';
        } else if (config.conf.runtime == 'D-Shell') {
            command = 'greentea ';
        } else {
            this.response.SetError({ code: -1, message: "Assure-It agent doesn't support such a script runtime" });
            this.response.Send();
            return;
        }

        for (var file in script.lib) {
            command += ' ' + scriptDir + '/' + file;
        }
        command += ' ' + scriptDir + '/' + mainFile;

        child_process.exec(command, null, function (error, stdout, stderr) {
            console.log(command);
            console.log('====OUT====');
            console.log(stdout);
            console.log('===ERROR===');
            console.log(stderr);
        });

        this.response.Send();
    };
    return AssureItAgentAPI;
})();

