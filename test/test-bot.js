var assert = require('assert');
var testUtil = require('./test-util');
var BotManager = require('../braid-bot').BotManager;
var BraidAddress = require('../braid-address').BraidAddress;
var handlerCallback;

var config;
var services;
var factory;
var bot;
var botMsgHandler;

describe("bot:", function() {
	before(function(done) {
		config = testUtil.createTestConfig("test.com");
		testUtil.createTestServicesWithStubs(config, function(err, testServices) {
			assert(!err);
			services = testServices;
			factory = services.factory;
			bot = new BotManager();
			bot.initialize(config, services);
			assert.equal(services.messageSwitch.hooks.length, 1);
			botMsgHandler = services.messageSwitch.hooks[0];
			done();
		});
	});

	after(function(done) {
		services.braidDb.close(done);
	});

	it("verifies ping behaviors", function(done) {
		var ping = factory.newPingRequest(new BraidAddress('joe', 'test.com'), new BraidAddress('bob', 'test.com', '12345'));
		services.messageSwitch.waitForMessage(1000, function(err, reply) {
			assert(!err);
			assert.equal(reply.to[0].userId, 'bob');
			assert.equal(reply.from.userId, 'joe');
			assert.equal(reply.from.resource, "!bot");
			done();
		});
		botMsgHandler(ping);
	});

	it("properly ignores tile-share when appropriate", function(done) {
		var tileInfo = factory.newTileInfo('t1', 'app1', 1, 0, null, null, []);
		// This tile-share is directed to a specific user at a resource, so bot should ignore it
		var tileShare = factory.newTileShareMessage(new BraidAddress('joe', 'test.com', '12345'), new BraidAddress('bob', 'test.com', '23456'));
		services.messageSwitch.waitForMessage(500, function(err, reply) {
			// This should timeout, because the tile-share was ignored
			assert(err);
			done();
		});
		botMsgHandler(tileShare);
	});

	it("responds with tile-accept on first tile-share, and ignored on second", function(done) {
		var tileInfo = factory.newTileInfo('t2', 'app1', 1, 0, null, null, []);
		// This tile-share is directed to all resources for same user, so bot should accept, store tile and send tile-accept
		var tileShare = factory.newTileShareMessage(new BraidAddress('joe', 'test.com'), new BraidAddress('joe', 'test.com', '12345'), tileInfo);
		services.messageSwitch.waitForMessage(1000, function(err, reply) {
			assert(!err);
			assert(reply.request, 'tile-accept');
			// Now if we send another tile share for the same tile, there should be no tile-accept coming back
			// because it already has this tile
			tileShare = factory.newTileShareMessage(new BraidAddress('joe', 'test.com'), new BraidAddress('joe', 'test.com', '12345'), tileInfo);
			services.messageSwitch.waitForMessage(500, function(err, reply) {
				// This one should have an error because no tile-accept comes back
				assert(err);
				done();
			});
		});
		botMsgHandler(tileShare);
	});

	it("properly processes a tile mutation", function(done) {
		var tileInfo = factory.newTileInfo('t3', 'app1', 1, 0, null, null, []);
		var originator = new BraidAddress('joe', 'test.com', '12345');
		var tileShare = factory.newTileShareMessage(new BraidAddress('joe', 'test.com', '!bot'), originator, tileInfo);
		services.messageSwitch.waitForMessage(1000, function(err, reply) {
			assert(!err);
			assert(reply.request, 'tile-accept');
			var mutation = factory.newTileMutation('t3', 'm1', 100, originator);
			mutation = factory.newTileMutationSetProperty(mutation, 'property1', 'string', 'hello');
			var mutationMessage = factory.newTileMutationMessage(new BraidAddress('joe', 'test.com', '!bot'), originator, mutation);
			botMsgHandler(mutationMessage);
			// Now it is going to process the mutation. We need to wait briefly, then check the database
			setTimeout(function() {
				services.braidDb.getTileProperty('t3', 'property1', function(err, record) {
					assert(!err);
					assert(record);
					assert.equal(record.value, 'hello');
					console.log("Property mutation was properly applied");
					// Now we're going to issue a tile-accept from the originator and see if we get back a proper reply followed by
					// the mutations
					var tileAccept = factory.newTileAcceptRequest(new BraidAddress('joe', 'test.com', '!bot'), new BraidAddress('joe', 'test.com', 'abcdef'),
							't3');
					services.messageSwitch.waitForMessages(2, 2000, function(err, messages) {
						assert(!err);
						assert.equal(messages.length, 2);
						assert.equal(messages[0].type, 'reply');
						assert.equal(messages[1].type, 'cast');
						assert.equal(messages[1].request, 'tile-mutation');
						assert.equal(messages[1].data.tileId, 't3');
						assert.equal(messages[1].data.mutationId, 'm1');
						done();
					});
					botMsgHandler(tileAccept);
				});
			}, 1000);
		});
		botMsgHandler(tileShare);
	});

});