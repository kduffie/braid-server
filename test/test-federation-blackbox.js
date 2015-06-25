var assert = require('assert');
var async = require('async');
var testUtil = require('./test-util');
var BraidServer = require('../braid-server-class');
var BraidClient = require('../braid-client');
var factory = require('../braid-factory');

var server1;
var config1;
var client1;

var server2;
var config2;
var client2;

describe('blackbox: federation', function() {
	before(function(done) {
		var steps = [];
		steps.push(function(callback) {
			config1 = testUtil.createTestConfig('test.26001', 26000, 26001);
			server1 = new BraidServer();
			server1.initialize(config1);
			server1.start(callback)
		});
		steps.push(function(callback) {
			config2 = testUtil.createTestConfig('test.27001', 27000, 27001);
			server2 = new BraidServer();
			server2.initialize(config2);
			server2.start(callback)
		});
		steps.push(function(callback) {
			client1 = new BraidClient(config1.domain, config1.client.port, 'localhost');
			client1.connect(function(err) {
				assert(!err);
				client1.register("joe", "password", callback);
			});
		});
		steps.push(function(callback) {
			client2 = new BraidClient(config2.domain, config2.client.port, 'localhost');
			client2.connect(function(err) {
				assert(!err);
				client2.register("bob", "password", callback);
			});
		});
		async.series(steps, done);
	});

	after(function(done) {
		server1.shutdown(function(err) {
			server2.shutdown(done);
		});
	});

	it("ping", function(done) {
		client1.pingEndpoint("bob@test.27001", function(err, reply) {
			assert(!err);
			console.log("Received ping reply", reply);
			assert.equal(reply.from.domain, "test.27001");
			assert.equal(reply.from.userId, "bob");
			done();
		});
	});

	it("federation-idle-timeout", function(done) {
		this.timeout(5000);
		// First, ensure that the link is open
		client1.pingEndpoint("bob@test.27001", function(err, reply) {
			assert(!err);
			var activeSession = server1.services.federationManager.activeSessionsByDomain['test.27001'];
			assert(activeSession);
			// Now wait long enough for idle to kick in
			setTimeout(function() {
				activeSession = server1.services.federationManager.activeSessionsByDomain['test.27001'];
				assert(!activeSession);
				done();
			}, 3000);
		});

	});

});