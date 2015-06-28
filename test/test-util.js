var MONGO_URL = "mongodb://localhost:27017/{dbname}";
var factory = require('../braid-factory');
var BraidDb = require('../braid-db');
var EventBus = require('../braid-event-bus');
var MessageSwitch = require('../braid-message-switch');
var AuthServer = require('../braid-auth').AuthServer;
var MessageSwitchStub = require('./stubs/braid-message-switch-stub');
var AuthServerStub = require('./stubs/braid-auth-stub');

function createTestServices(config, callback) {
	var braidDb = new BraidDb(config);
	braidDb.initialize(config, function(err) {
		if (err) {
			console.log("Error opening mongo.  Are you running mongo?");
			throw "Mongo error: " + err;
		}
		var eventBus = new EventBus();
		var messageSwitch = new MessageSwitch();
		var authServer = new AuthServer();
		var services = {
			factory : factory,
			braidDb : braidDb,
			eventBus : eventBus,
			messageSwitch : messageSwitch,
			authServer : authServer
		};
		callback(null, services);
	});
}

function createTestServicesWithStubs(config, callback) {
	var braidDb = new BraidDb(config);
	braidDb.initialize(config, function(err) {
		if (err) {
			console.log("Error opening mongo.  Are you running mongo?");
			throw "Mongo error: " + err;
		}
		var eventBus = new EventBus();
		var messageSwitch = new MessageSwitchStub();
		var authServer = new AuthServerStub();
		var services = {
			factory : factory,
			braidDb : braidDb,
			eventBus : eventBus,
			messageSwitch : messageSwitch,
			authServer : authServer
		};
		messageSwitch.initialize(config, services);
		authServer.initialize(config, services);
		callback(null, services);
	});
}

function createTestConfig(domain, dbName, clientPort, serverPort, federationTimeout) {
	if (!domain) {
		domain = 'test.com';
	}
	if (!clientPort) {
		clientPort = 25555;
	}
	if (!serverPort) {
		serverPort = clientPort + 2
	}
	if (!federationTimeout) {
		federationTimeout = 5000;
	}
	if (!dbName) {
		dbName = "test1";
	}
	var mongoUrl = MONGO_URL.split("{dbname}").join(dbName);
	var config = {
		"domain" : domain,
		"mongo" : {
			"domain" : domain,
			"mongoUrl" : mongoUrl,
			"options" : {
				"dropDbOnStartup" : true
			}
		},
		"ssl" : {
			"key" : "/path/to/your/ssl.key",
			"cert" : "/path/to/your/ssl.crt"
		},
		"client" : {
			"enabled" : true,
			"ssl" : false,
			"port" : clientPort,
			"hello" : {}
		},
		"federation" : {
			"enabled" : true,
			"ssl" : false,
			"port" : serverPort,
			"idleInSeconds" : federationTimeout,
			"hello" : {}
		},
		"fileServer" : {
			"port" : serverPort + 10
		},
		"debug" : {
			"messageSwitch" : {
				"logMessages" : false
			},
			"clientSessions" : {
				"logMessages" : false
			},
			"federation" : {
				"logMessages" : false,
				"idlePoll" : 300
			}
		}
	};
	return config;
}

module.exports = {
	createTestConfig : createTestConfig,
	createTestServices : createTestServices,
	createTestServicesWithStubs : createTestServicesWithStubs
};