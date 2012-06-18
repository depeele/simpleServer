/** @file
 *
 *  Simple web server that can serve static files as well as invoke a 'route'
 *  callback to handle requests that don't match any existing static file.
 *
 */
var Http    = require('http'),
    Https   = require('https'),
    Path    = require('path'),
    Fs      = require('fs'),
    _       = require('underscore'),
    Mime    = require('./mime.js');

module.exports = {
    createServer: function(config) {
        return new Server(config);
    }
};

/** @brief  A server instance.
 *  @param  config  A configuration object:
 *                      port:   port number to listen on    [ 8080 ],
 *                      maxAge: cache-control maximum age
 *                              (seconds)                   [ 31536000 ]
 *                      listen: A listen callback invoked when the server
 *                              begins 'listening'
 *                                  listen()
 *                      auth:   A callback invoked when a connection is
 *                              established to perform any initial
 *                              authentication.  If this callback returns
 *                              false, the connection is closed with a 401
 *                              (Unauthorized):
 *                                  auth(request, response);
 *                      route:  A callback to handle any requests that cannot
 *                              be satisfied by a static file:
 *                                  route(request, response)
 *                      https:  If provided, the server will be an HTTP server
 *                              using this object for configuration.
 */
function Server(config)
{
    var self        = this,
        onRequest   = function(request, response) {
                        return self.handleRequest(request, response);
                      },
        onListen    = function() {
                        if (_.isFunction(self.config.listen))
                        {
                            self.config.listen.call(self);
                        }
                        else
                        {
                            console.log('>>> Web Server available at %s://%s/',
                                        (self.config.https ? 'https' : 'http'),
                                        'localhost:'+ self.config.port);
                        }
                      };

    self.config = _.extend({}, Server.defaults, config || {});

    if (self.config.https)
    {
        self.server = Https.createServer(self.config.https, onRequest);
    }
    else
    {
        self.server = Http.createServer(onRequest);
    }

    self.server.listen(self.config.port, onListen);
}

Server.defaults = {
    port:   8080,
    maxAge: 31536000    // cache-control maximum age (in seconds)
}

_.extend(Server.prototype, {

    /** @brief  If there is no static file matching the incoming URL, the
     *          request is passed to this method for routing.
     *  @param  request     The incoming Http(s).ServerRequest;
     *  @param  response    The related  Http(s).ServerResponse;
     */
    routeRequest: function(request, response) {
        var self    = this;
    
        if (_.isFunction(self.config.route))
        {
            return self.config.route.call(self, request, response);
        }
    
        //console.log("routeRequest[ %s ]", request.url);
        self.sendResponse(response, {
                            code:   404,
                            content:'404: Not Found'
                          });
    },
    
    /** @brief  Handle a new, incoming request.
     *  @param  request     The incoming Http.ServerRequest;
     *  @param  response    The related  Http.ServerResponse;
     *  
     *  Files are served from the 'public' subdirectory.  If the requested URL
     *  matches a file, return it directly.  If it matches a directory, append
     *  'index.html' and attempt to return it.
     *
     *  If there is no successful match, invoke routeRequest().
     */
    handleRequest: function(request, response) {
        var self    = this;

        if (_.isFunction(self.config.auth))
        {
            // Check authentication/authorization
            if (self.config.auth.call(self, request, response) === false)
            {
                // NOT authenticated/authorized
                return self.sendResponse(response, {
                                            code:   401,
                                            content:'401: Not Authorized'
                                         });
            }
        }

        // Continue processing this request
        var file    = Path.normalize('./public/'+ request.url),
            stat    = null;
    
        try     {
            stat = Fs.statSync(file);
            console.log("1: url[ %s ] resolved to [ %s ]",
                        request.url, file);
        }
        catch(e){}

        if (stat && stat.isDirectory())
        {
            file = Path.normalize(file +'/index.html');
        }
    
        Fs.stat(file, function(err, stat) {
            if (err)
            {
                // NOT a valid file
                return self.routeRequest(request, response);
            }
    
            // This path/file exists.  Attempt to return the contents.
            Fs.readFile(file, function(err, content) {
                if (err)
                {
                    // Cannot read the file -- return 500
                    return self.sendResponse(response, {
                                                code:   500,
                                                content:'500: Cannot read file '
                                                        + '['+ file +']'
                                            });
                }
    
                var isHead      = (request.method === 'HEAD'),
                    mimeType    = Mime.lookup(file),
                    encoding    = Mime.encoding(mimeType),
                    headers     = {
                        'Content-Type':   mimeType,
                        'Content-Length': stat.size,
                        'Last-Modified':  stat.mtime.toUTCString(),
                        'Cache-Control':  'public max-age='+ self.config.maxAge,
                        'ETag':           stat.size +'-'+ Number(stat.mtime),
                        'Accept-Ranges':  'bytes'
                    };
    
                if (! contentModified(request, response, headers))
                {
                    // NOT modified -- return 304
                    removeContentHeaders(response);
    
                    response.statusCode = 304;
                    response.end();
                    return;
                }
    
                /*
                console.log("handleRequest[ %s ] : [ %s ] == [ %s ]",
                            request.url, file, content);
                // */
    
                self.sendResponse(response, {
                                    mimeType:       mimeType,
                                    encoding:       encoding,
                                    headers:        headers,
                                    content:        content,
                                    headersOnly:    isHead
                                  });
            });
        });
    },
    
    /** @brief  Send a response.
     *  @param  response    The Http.ServerResponse to use;
     *  @param  config      Send configuration/data:
     *                          { mimeType:     string,
     *                            encoding:     string,
     *                            code:         HTTP status code [ 200 ],
     *                            headers:      { HTTP headers },
     *                            content:      string | buffer,
     *
     *                            noClose:      true | [ false ],
     *                            noHead:       true | [ false ],
     *                            headersOnly:  true | [ false ]
     *                          }
     *
     *  If 'config.content' is a string, the default 'mimeType' will be
     *  'text/html', otherwise, it will be JSON encoded and sent as
     *  'application/json'.
     */
    sendResponse: function(response, config) {
        var self    = this,
            headers = config.headers || {
                        'Content-Type': (config.mimeType || 'text/html')
                      };
    
        //console.log("sendResponse: config[ %j ]", config);
    
        if ( (config.headersOnly !== true)                     &&
             headers['Content-Type']                           &&
             (headers['Content-Type'].substr(0,4) === 'text')  &&
             (! _.isString(config.content)) )
        {
            if (Buffer.isBuffer(config.content))
            {
                config.content = config.content.toString(
                                                    config.encoding || 'utf8');
            }
            else
            {
                config.content = JSON.stringify(config.content);
                headers['Content-Type'] = 'application/json';
            }
        }
    
        if (_.isString(config.content) && (config.noClose !== true))
        {
            headers['Content-Length'] = config.content.length;
        }
    
        if (config.noHead !== true)
        {
            // Write headers
            response.writeHead( (config.code ? config.code : 200), headers);
        }
    
        if (config.headersOnly !== true)
        {
            // Write the content
            response.write( config.content  || '',
                            config.encoding || 'utf8' );
        }
    
        if (config.noClose !== true)
        {
            response.end();
        }
    }
});

/*******************************************************************************
 * Private helpers
 *
 */

/** @brief  Determine whether 'headers' indicate that the forthcoming
 *          content has been modified according to any modification/caching
 *          checks in the provided 'request'.
 *  @param  request     The incoming Http.ServerRequest;
 *  @param  response    The related  Http.ServerResponse;
 *  @param  headers     Information about the forthcoming content;
 *
 *  Check whether the initial response headers indicate that the
 *  forthcoming content has been modified according to any
 *  modification/caching checks in the request.
 *
 *  @return true | false
 */
function contentModified(request, response, headers)
{
    var headers         = headers || response._headers || {},
        modifiedSince   = request.headers['if-modified-since'],
        lastModified    = headers['Last-Modified'],
        noneMatch       = request.headers['if-none-match'],
        etag            = headers['ETag'];

    if (noneMatch)  { noneMatch = noneMatch.split(/ *, */); }

    // Check If-None-Match
    if (noneMatch && etag && ~noneMatch.indexOf(etag))
    {
        return false;
    }

    // Check If-Modified-Since
    if (modifiedSince && lastModified)
    {
        modifiedSince = new Date(modifiedSince);
        lastModified  = new Date(lastModified);

        // Ignore invalid dates
        if (! isNaN(modifiedSince.getTime()) )
        {
            if (lastModified <= modifiedSince)  { return false; }
        }
    }

    return true;
}

/** @brief  Strip any 'Content-*' headers from the provided response.
 *  @param  response    The Http.ServerResponse to strip headers from;
 */
function removeContentHeaders(response)
{
    _.each(response, function(val, key) {
        if (key.indexOf('content') === 0)
        {
            response.removeHeader(key);
        }
    });
}
