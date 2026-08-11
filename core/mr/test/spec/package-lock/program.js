/*
 * Note that the node_modules structure is not an expected result from
 * running npm install, but the package should still load using the
 * package-lock.json.
 */

var test = require('test'),
    explicit = require("explicit"),
    transitive = require("transitive");

if (explicit !== transitive) {
    throw new Error("A registered package name must retain a single module identity");
}
require("http-server");
require("url");
test.print('DONE', 'info');
