var util = require('util');
var EventEmitter = require('events').EventEmitter;

function EventBus() {
}

util.inherits(EventBus, EventEmitter);

EventBus.prototype.initialize = function() {
};

EventBus.prototype.fire = function(event, data) {
	this.emit(event, data);
};

module.exports = EventBus;