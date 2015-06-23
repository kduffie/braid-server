var MONGO_URL = "mongodb://localhost:27017/{domain}";
var factory = require('../braid-factory');
var BraidDb = require('../braid-db');
var EventBus = require('../braid-event-bus');
var MessageSwitch = require('../braid-message-switch');
var AuthServer = require('../braid-auth').AuthServer;

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

function createTestConfig(domain, clientPort, serverPort) {
	if (!domain) {
		domain = 'test.com';
	}
	if (!clientPort) {
		clientPort = 25555;
	}
	if (!serverPort) {
		serverPort = clientPort + 2
	}
	var mongoUrl = MONGO_URL.replace("{domain}", domain.replace(".", "_"));
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
			"hello" : {}
		}
	};
	return config;
}

module.exports = {
	createTestConfig : createTestConfig,
	createTestServices : createTestServices
};