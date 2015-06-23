var assert = require('assert');
var EventBus = require('../braid-event-bus');

var eventObject;

describe("event-bus:", function() {
	it("checks that events work", function(done) {
		var eventBus = new EventBus();
		eventBus.on('test-event', function(arg) {
			assert.equal(arg.data, 1);
			done();
		});
		eventBus.fire('test-event', {
			data : 1
		});
	});
});