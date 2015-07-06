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
			assert(!err, err);
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
		var ping = factory.newPingRequestMessage(new BraidAddress('bob', 'test.com', '12345'), new BraidAddress('joe', 'test.com'));
		services.messageSwitch.waitForMessage(1000, function(err, reply) {
			assert(!err, err);
			assert.equal(reply.to[0].userId, 'bob');
			assert.equal(reply.from.userId, 'joe');
			assert.equal(reply.from.resource, "!bot");
			done();
		});
		botMsgHandler(ping);
	});

	// it("properly processes a tile mutation", function(done) {
	// var tileInfo = factory.newTileInfo('t3', 'app1', 1, 0, null, null, []);
	// var originator = new BraidAddress('joe', 'test.com', '12345');
	// var tileShare = factory.newTileShareMessage(new BraidAddress('joe', 'test.com', '!bot'), originator, tileInfo);
	// services.messageSwitch.waitForMessage(1000, function(err, reply) {
	// assert(!err, err);
	// assert(reply.request, 'tile-accept');
	// var mutation = factory.newTileMutation('t3', 'm1', 100, originator);
	// mutation = factory.newTileMutationSetProperty(mutation, 'property1', 'string', 'hello');
	// var mutationMessage = factory.newTileMutationMessage(new BraidAddress('joe', 'test.com', '!bot'), originator, mutation);
	// botMsgHandler(mutationMessage);
	// // Now it is going to process the mutation. We need to wait briefly, then check the database
	// setTimeout(function() {
	// services.braidDb.getTileProperty('t3', 'property1', function(err, record) {
	// assert(!err, err);
	// assert(record);
	// assert.equal(record.value, 'hello');
	// console.log("Property mutation was properly applied");
	// // Now we're going to issue a tile-accept from the originator and see if we get back a proper reply followed by
	// // the mutations
	// var tileAccept = factory.newTileAcceptMessage(new BraidAddress('joe', 'test.com', '!bot'), new BraidAddress('joe', 'test.com', 'abcdef'),
	// 't3');
	// services.messageSwitch.waitForMessages(1, 2000, function(err, messages) {
	// assert(!err, err);
	// assert.equal(messages.length, 1);
	// assert.equal(messages[0].type, 'cast');
	// assert.equal(messages[0].request, 'tile-mutation');
	// assert.equal(messages[0].data.tileId, 't3');
	// assert.equal(messages[0].data.mutationId, 'm1');
	// done();
	// });
	// botMsgHandler(tileAccept);
	// });
	// }, 1000);
	// });
	// botMsgHandler(tileShare);
	// });

});