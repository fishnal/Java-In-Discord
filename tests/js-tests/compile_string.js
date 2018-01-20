const Server = require('../../src/js/server').Server;

var server = new Server();

server.compileString('class A {}', {});