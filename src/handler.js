


var RequestHandler = (function () {
    function RequestHandler(serverRequest) {
        this.request = new Request(serverRequest);
    }
    RequestHandler.prototype.activate = function (serverResponse) {
        var self = this;

        this.request.serverRequest.on('data', function (chunk) {
            self.request.body += chunk;
        });

        this.request.serverRequest.on('end', function () {
            var response = new Response(serverResponse);

            if (self.request.method != 'POST') {
                response.statusCode = 400;
                response.send();
                return;
            }

            var api = new AssureItAgentAPI(self.request.body, response);
            api.invoke();
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
    return Request;
})();

var Response = (function () {
    function Response(serverResponse) {
        this.serverResponse = serverResponse;
        this.body = "";
        this.statusCode = 200;
    }
    Response.prototype.send = function () {
        this.serverResponse.write(this.body);
        this.serverResponse.writeHead(this.statusCode, { 'Content-Type': 'application/json' });
        this.serverResponse.end();
    };
    return Response;
})();

var AssureItAgentAPI = (function () {
    function AssureItAgentAPI(cmd, response) {
        this.cmd = cmd;
        this.response = response;
    }
    AssureItAgentAPI.prototype.invoke = function () {
        this.response.send();
    };

    AssureItAgentAPI.prototype.executeScript = function () {
    };
    return AssureItAgentAPI;
})();

