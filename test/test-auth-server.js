var assert = require('assert');
var messageSwitch = require('../braid-message-switch');
var factory = require('../braid-factory');
var braidDb;

var MONGO_URL = "mongodb://localhost:27017/braidTest";

var portAddress = {
	resource : '12345'
};

var userAddress = {
	domain : 'test.com',
	userId : 'joe',
	resource : '12345'
};

var authAddress = {
	domain : 'test.com',
	resource : '!auth'
};

var handlerCallback;
var expectedType = 'register';

var authServer;

function handleMessage(message) {
	switch (expectedType) {
	case 'register':
		assert.equal(message.type, 'reply');
		assert.equal(message.request, 'register');
		handlerCallback();
		break;
	case 'auth':
		assert.equal(message.type, 'reply');
		assert.equal(message.request, 'auth');
		handlerCallback();
		break;
	default:
		throw "Unhandled expected type";
	}
}

describe("auth-server:", function() {
	before(function(done) {
		messageSwitch.reset();
		var config = {
			mongo : {
				domain : 'test.com',
				mongoUrl : MONGO_URL,
				options : {
					dropDbOnStartup : true
				}
			}
		};
		require('../braid-db').initialize(config, function(err, db) {
			if (err) {
				throw err;
			}
			braidDb = db;
			require('../braid-auth').initialize(config, braidDb);
			messageSwitch.registerResource('12345', null, handleMessage);
			done();
		});
	});

	after(function(done) {
		braidDb.close(done);
	});

	it("verifies registration and auth", function(done) {
		var registerMessage = factory.newRegisterRequest(userAddress.userId, "pa55word", authAddress, portAddress);
		expectedType = 'register';
		handlerCallback = function() {
			var authMessage = factory.newAuthRequest(userAddress.userId, "pa55word", authAddress, portAddress);
			expectedType = 'auth';
			messageSwitch.deliver(authMessage);
			handlerCallback = done;
		};
		messageSwitch.deliver(registerMessage);
		// Now we wait for handleMessage to be called with the response
	});
});