var assert = require('assert');
var testUtil = require('./test-util');
var BraidServer = require('../braid-server-class');
var BraidClient = require('../braid-client');
var factory = require('../braid-factory');

var server;
var config;

describe('blackbox: single-server', function() {
	before(function(done) {
		config = testUtil.createTestConfig();
		server = new BraidServer();
		server.initialize(config);
		server.start(done);
	});

	after(function(done) {
		server.shutdown(done);
	});

	it("unauthenticated hello", function(done) {
		var client = new BraidClient(config.domain, config.client.port, 'localhost');
		client.connect(function(err) {
			assert(!err);
			client.sendHello(factory.newHelloPayload("blackbox-test", "0.1", {
				v : 1
			}), function(err, response) {
				assert(!err);
				assert.equal(response.data.product, "braid-server");
				client.close();
				done();
			});
		});
	});

	it("register and then auth", function(done) {
		var client1 = new BraidClient(config.domain, config.client.port, 'localhost');
		client1.connect(function(err) {
			assert(!err);
			client1.register("joe", "password", function(err) {
				assert(!err);
				client1.close();
				var client2 = new BraidClient(config.domain, config.client.port, 'localhost');
				client2.connect(function(err) {
					assert(!err);
					client2.authenticate("joe", "foobar", function(err) {
						assert(err);
						client2.authenticate("joe", "password", function(err) {
							assert(!err);
							client2.close();
							done();
						});
					});
				});
			});
		});
	});

	it("ping", function(done) {
		var client1 = new BraidClient(config.domain, config.client.port, 'localhost');
		client1.connect(function(err) {
			assert(!err);
			client1.authenticate("joe", "password", function(err, reply) {
				assert(!err);
				client1.pingServer(function(err, reply) {
					assert(!err);
					client1.pingEndpoint("joe/!bot", function(err, reply) {
						assert(!err);
						done();
					});
				});
			});
		});
	});
});