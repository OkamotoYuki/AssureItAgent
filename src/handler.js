
var process = require('child_process');
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

    AssureItAgentAPI.prototype.ExecuteScript = function (params) {
        var self = this;
        var script = params.script;

        if (config.conf.runtime == 'bash') {
            process.exec('bash -c ' + script, null, function (error, stdout, stderr) {
                console.log('====OUT====');
                console.log(stdout);
                console.log('===ERROR===');
                console.log(stderr);
            });
        } else if (config.conf.runtime == 'D-Shell') {
            process.exec('greentea ' + script, null, function (error, stdout, stderr) {
                console.log('====OUT====');
                console.log(stdout);
                console.log('===ERROR===');
                console.log(stderr);
            });
        } else {
            self.response.SetError({ code: -1, message: "Assure-It agent doesn't support such a script runtime" });
        }

        this.response.Send();
    };
    return AssureItAgentAPI;
})();

