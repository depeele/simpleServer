/** @file
 *
 *  Simple file extension to mime-type mapping.
 *
 */
var Path    = require('path'),
    Fs      = require('fs');

var mime    = module.exports = {
    /** @brief  A map of extension to mime-type */
    types:  {},

    /** @brief  The default mime-type and encoding */
    defaults:   {
        type:       'application/octet-stream',
        encoding:   'binary'
    },

    /** @brief  Define mime-type to extension mappings.
     *  @param  map The map;
     *
     *  Each key is a mime-type with an array of extensions to be associated
     *  with that type.
     */
    define: function(map) {
        var self    = this;

        // Merge the incoming 'map' with any existing self.types
        for (var type in map)
        {
            var exts    = map[type];

            for (var idex = 0, len = exts.length; idex < len; idex++)
            {
                self.types[ exts[idex] ] = type;
            }
        }
    },

    /** @brief  Load an Apache2-style '.types' file to define mime-types.
     *  @param  file    The path of the file to load.
     *
     *  @return true | Error instance
     */
    load: function(file) {
        var map = {},     // { balance the brace on the line below
            reClean = /\s*$.*}^\s*|\s*$/g,
            reField = /\s+/,
            content;

        try     { content = Fs.readFileSync(file, 'ascii'); }
        catch(e){ return e; }

        var lines   = content.split(/[\r\n]+/);

        /* Each line has the form:
         *  mime-type ext1 ext2 ext3
         */
        lines.forEach(function(line, lineno) {
            // Cleanup whitespace, comment, and split the line into fields
            var fields  = line.replace(reClean, '').split(reField);

            map[ fields.shift() ] = fields;
        });

        this.define(map);

        return true;
    },

    /** @brief  Lookup a mime-type based upon an extension.
     *  @param  pathname    The path from which to pull the extension;
     *  @param  defaultType The default to use if no match can be found
     *                      [ mime.defaults.type ];
     *
     *  @return The mime-type
     */
    lookup: function(pathname, defaultType) {
        var ext = Path.extname(pathname).substr(1).toLowerCase();

        return this.types[ext] || defaultType || this.defaults.type;
    },

    /** @brief  Given a mime-type, determine a "proper" encoding.
     *  @param  mimeType    The mime-type;
     *  @param  defaultEnc  The default encoding if no match can be found
     *                      [ mime.defaults.encoding ];
     *
     *  @return The encoding
     */
    encoding: function(mimeType, defaultEnc) {
        return (mimeType.substr(0, 4) === 'text'
                    ? 'utf8'    // ascii, utf8, base64, null
                    : (defaultEnc || this.defaults.encoding));
    }
};


/* Start with our local copy of mime.types
 *  (in the same directory as this source)
 */
var typeFile    = Path.join(__dirname, 'mime.types'),
    res         = mime.load( typeFile );
if (res !== true)
{
    console.log("*** mime.load: Cannot initialize types: %s", res);
}
else
{
    mime.defaults.type      = mime.types.bin;
    mime.defaults.encoding  = 'binary';
}
