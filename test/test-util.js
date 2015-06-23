var MONGO_URL = "mongodb://localhost:27017/braidTest";
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
		messageSwitch.initialize(config, services);
		authServer.initialize(config, services);
		callback(null, services);
	});
}

function createTestConfig() {
	return config = {
		mongo : {
			domain : 'test.com',
			mongoUrl : MONGO_URL,
			options : {
				dropDbOnStartup : true
			}
		}
	};
}

module.exports = {
	createTestConfig : createTestConfig,
	createTestServices : createTestServices
};