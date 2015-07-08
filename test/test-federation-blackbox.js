var assert = require('assert');
var async = require('async');
var testUtil = require('./test-util');
var BraidServer = require('../braid-server-class');
var BraidClient = require('../braid-client');
var factory = require('../braid-factory');

var server1;
var config1;
var client1;
var client1PresenceNotifications = [];

var server2;
var config2;
var client2;
var client2PresenceNotifications = [];

describe('blackbox: federation', function() {
	before(function(done) {
		this.timeout(5000);
		var steps = [];
		steps.push(function(callback) {
			config1 = testUtil.createTestConfig('test.26001', 'test1', 26000, 26001, 1);
			server1 = new BraidServer();
			server1.initialize(config1);
			server1.start(callback)
		});
		steps.push(function(callback) {
			config2 = testUtil.createTestConfig('test.27001', 'test2', 27000, 27001, 1);
			server2 = new BraidServer();
			server2.initialize(config2);
			server2.start(callback)
		});
		steps.push(function(callback) {
			client1 = new BraidClient(config1.domain, config1.client.port, 'localhost');
			client1.onPresenceNotification(function(presenceMessage) {
				client1PresenceNotifications.push(presenceMessage);
			});
			client1.connect(function(err) {
				assert(!err, err);
				client1.register("joe", "password", callback);
			});
		});
		steps.push(function(callback) {
			client2 = new BraidClient(config2.domain, config2.client.port, 'localhost');
			client2.onPresenceNotification(function(presenceMessage) {
				client2PresenceNotifications.push(presenceMessage);
			});
			client2.connect(function(err) {
				assert(!err, err);
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
		this.timeout(10000);
		client1.pingEndpoint("bob@test.27001", function(err, reply) {
			assert(!err, err);
			console.log("Received ping reply", reply);
			assert.equal(reply.from.domain, "test.27001");
			assert.equal(reply.from.userid, "bob");
			done();
		});
	});

	it("federated-presence", function(done) {
		this.timeout(10000);
		client1.subscribe("bob@test.27001");
		client2.subscribe("joe@test.26001");
		setTimeout(function() {
			// Time enough for subscribe messages to be delivered
			client1.close();
			var retries = 0;
			var timer1 = setInterval(function() {
				if (client2PresenceNotifications.length > 0) {
					clearInterval(timer1);
					assert.equal(client2PresenceNotifications[0].from.domain, 'test.27001');
					assert.equal(client2PresenceNotifications[0].data.online, false);
					assert.equal(client2PresenceNotifications[0].data.address.userid, 'joe');

					// Now try connecting again and see that presence
					client1 = new BraidClient(config1.domain, config1.client.port, 'localhost');
					client1.onPresenceNotification(function(presenceMessage) {
						client1PresenceNotifications.push(message);
					});
					client1.connect(function(err) {
						assert(!err, err);
						client1.authenticate("joe", "password", function(err, reply) {
							assert(!err, err);
							var retries = 0;
							var timer2 = setInterval(function() {
								if (client2PresenceNotifications.length > 1) {
									clearInterval(timer2);
									assert.equal(client2PresenceNotifications[1].from.domain, 'test.27001');
									assert.equal(client2PresenceNotifications[1].data.online, true);
									assert.equal(client2PresenceNotifications[1].data.address.userid, 'joe');
									done();
								} else {
									retries++;
									if (retries > 30) {
										clearInterval(timer2);
										throw "Timeout waiting for presence notification";
									}
								}
							}, 100);

						});
					});
				} else {
					retries++;
					if (retries > 30) {
						clearInterval(timer1);
						throw "Timeout waiting for presence notification";
					}
				}
			}, 100);
		}, 1000);
	});

	it("federation-idle-timeout", function(done) {
		this.timeout(10000);
		// First, ensure that the link is open
		client1.pingEndpoint("bob@test.27001", function(err, reply) {
			assert(!err, err);
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