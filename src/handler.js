
var debug = require("./debug");

var RequestHandler = (function () {
    function RequestHandler(request, response) {
        this.request = request;
        this.response = response;
        this.httpStatusCode = 200;

        if (request.method != 'POST') {
            debug.outputErrorMessage("AssureItAgent allows 'POST' method only");
            this.response.write("AssureItAgent allows 'POST' method only");
            this.httpStatusCode = 400;
        }
    }
    RequestHandler.prototype.invokeHandlerAPI = function () {
        if (this.httpStatusCode != 200)
            return;
    };

    RequestHandler.prototype.executeScript = function () {
        if (this.httpStatusCode != 200)
            return;
    };

    RequestHandler.prototype.sendResponse = function () {
        this.response.writeHead(this.httpStatusCode, { 'Content-Type': 'application/json' });
        this.response.end();
    };
    return RequestHandler;
})();
exports.RequestHandler = RequestHandler;

