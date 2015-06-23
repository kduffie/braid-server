var assert = require('assert');
var testUtil = require('./test-util');
var BraidServer = require('../braid-server-class');
var BraidClient = require('../braid-client');
var factory = require('../braid-factory');

var server1;
var config1;
var server2;
var config2

describe('blackbox: two servers', function() {
	before(function(done) {
		config1 = testUtil.createTestConfig('test.26001', 26000, 26001);
		server1 = new BraidServer();
		server1.initialize(config1);
		server1.start(function(err) {
			config2 = testUtil.createTestConfig('test.27001', 27000, 27001);
			server2 = new BraidServer();
			server2.initialize(config2);
			server2.start(done);
		});
	});

	after(function(done) {
		server1.shutdown(function(err) {
			server2.shutdown(done);
		});
	});

	it("ping", function(done) {
		var client1 = new BraidClient(config1.domain, config1.client.port, 'localhost');
		client1.connect(function(err) {
			assert(!err);
			client1.register("joe", "password", function(err, reply) {
				assert(!err);
				var client2 = new BraidClient(config2.domain, config2.client.port, 'localhost');
				client2.connect(function(err) {
					assert(!err);
					client2.register("bob", "password", function(err, reply) {
						assert(!err);

						// At this point, we should have two servers up, with a client signed into each

						client1.pingEndpoint("bob@test.27001", function(err, reply) {
							assert(!err);
							console.log("Received ping reply", reply);
							assert.equal(reply.from.domain, "test.27001");
							assert.equal(reply.from.userId, "bob");
							done();
						});
					});
				});
			});
		});
	});

});