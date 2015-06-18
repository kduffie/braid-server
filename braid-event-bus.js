var util = require('util');
var EventEmitter = require('events').EventEmitter;

function EventBus() {
}

util.inherits(EventBus, EventEmitter);

EventBus.prototype.fire = function(event, data) {
	this.emit(event, data);
};

var eventBus = new EventBus();

module.exports = eventBus;