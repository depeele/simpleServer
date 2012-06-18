#!/usr/bin/env node
var config  = {
        listen: onListen,
        auth:   onAuth,
        route:  onRoute
    },
    server  = require('./lib/simpleServer.js').createServer(config);

/** @brief  Invoked when the server successfully enters the 'listening' state.
 *  
 *  (invoke in the context of 'server')
 */
function onListen()
{
    console.log(">>> Web Server available at %s://%s/",
                (this.config.https ? 'https' : 'http'),
                'localhost:'+ this.config.port);
}

/** @brief  Invoked when a connection is established to perform any desired
 *          authentication/authorization.
 *  @param  request     The incoming Http(s).ServerRequest;
 *  @param  response    The incoming Http(s).ServerResponse;
 *
 *
 *  (invoke in the context of 'server')
 *
 *  @return true  (authenticated/authorized) or
 */
function onAuth(request, response)
{
    console.log("onAuth: url[ %s ]", request.url);
    return true;
}

/** @brief  If there is no static file matching the incoming URL, the request
 *          is passed to this function for dynamic routing.
 *  @param  request     The incoming Http(s).ServerRequest;
 *  @param  response    The incoming Http(s).ServerResponse;
 *  
 *  (invoke in the context of 'server')
 */
function onRoute(request, response)
{
    console.log("onRoute: url[ %s ]", request.url);

    this.sendResponse(response, '404: Not Found', {code:404});
}
