var assert = require('assert');
var testUtil = require('./test-util');

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

var config;
var services;

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
		config = testUtil.createTestConfig("test.com");
		testUtil.createTestServices(config, function(err, testServices) {
			if (err) {
				throw err;
			}
			services = testServices;
			services.messageSwitch.initialize(config, services);
			services.authServer.initialize(config, services);
			services.messageSwitch.registerResource('12345', null, handleMessage);
			done();
		});
	});

	after(function(done) {
		services.braidDb.close(done);
	});

	it("verifies registration and auth", function(done) {
		var registerMessage = services.factory.newRegisterRequestMessage(userAddress.userId, "pa55word", authAddress, portAddress);
		expectedType = 'register';
		handlerCallback = function() {
			var authMessage = services.factory.newAuthRequestMessage(userAddress.userId, "pa55word", authAddress, portAddress);
			expectedType = 'auth';
			services.messageSwitch.deliver(authMessage);
			handlerCallback = done;
		};
		services.messageSwitch.deliver(registerMessage);
		// Now we wait for handleMessage to be called with the response
	});
});